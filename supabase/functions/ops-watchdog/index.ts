import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============ EXPECTED STEP DURATIONS (Hard Watchdog SLA) ============
// UPDATED: Base durations in seconds for each step (calibrated for 2+ hour videos)
// These are generous to prevent false stall detection on long content
// PHASE 2 FIX: Reduced thresholds for faster stall detection
const EXPECTED_STEP_DURATIONS: Record<string, number> = {
  'transcribe': 600,              // 10 min (reduced from 15 for faster detection)
  'transcribe_and_extract': 1200, // 20 min (reduced from 30)
  'extract_frames': 1800,          // 30 min (reduced from 45)
  'render_gifs': 1200,            // 20 min (reduced from 30)
  'analyze_audio': 300,           // 5 min (reduced from 10)
  'build_pdf': 300,               // 5 min (reduced from 10)
  'transcribe_module': 600,       // 10 min per module
  'transcribe_and_extract_module': 1200, // 20 min per module
  'extract_frames_module': 1800,  // 30 min per module
  'render_gifs_module': 1200,     // 20 min per module
  'analyze_audio_module': 300,    // 5 min per module
  'build_pdf_module': 300,        // 5 min per module
  'default': 1200,                // 20 min default (reduced from 30)
};

// Visibility timeout threshold - if job has expired visibility, it's stalled
const VISIBILITY_TIMEOUT_CHECK = true;

// ============ MONITORED QUEUE INSERTION ============

// Queue insertion with constraint violation monitoring
async function insertQueueEntry(
  supabase: any, 
  courseId: string, 
  step: string, 
  metadata?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.from("processing_queue").insert({
      course_id: courseId,
      step: step,
      status: "pending",
      metadata: metadata || {},
    }).select().single();
    
    if (error) {
      const errorMessage = error.message || 'Unknown queue insertion error';
      const isConstraintViolation = errorMessage.includes('violates check constraint') || 
                                     errorMessage.includes('constraint');
      
      console.error(`[queue-insert] FAILED for course ${courseId}, step ${step}:`, errorMessage);
      
      await supabase.from("error_logs").insert({
        course_id: courseId,
        error_type: isConstraintViolation ? 'queue_constraint_violation' : 'queue_insertion_failed',
        error_message: `Queue insert failed: ${errorMessage}`,
        step: step,
        fix_strategy: isConstraintViolation 
          ? 'Add step to processing_queue_step_check constraint'
          : 'Investigate queue insertion failure',
        attempt_number: 1
      }).catch((e: Error) => console.warn('[queue-insert] Failed to log error:', e));
      
      return { success: false, error: errorMessage };
    }
    
    console.log(`[queue-insert] SUCCESS: course ${courseId}, step ${step}, job ${data?.id}`);
    return { success: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[queue-insert] EXCEPTION for course ${courseId}, step ${step}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============ DEGRADATION MODES ============
// When retries exceed thresholds, progressively degrade quality instead of failing
const DEGRADATION_MODES = [
  { level: 0, name: 'full_quality', fps: 3, skipGifs: false, transcriptOnly: false },
  { level: 1, name: 'reduced_fps', fps: 1, skipGifs: false, transcriptOnly: false },
  { level: 2, name: 'reduced_resolution', fps: 1, skipGifs: false, transcriptOnly: false },
  { level: 3, name: 'minimal_frames', fps: 1, skipGifs: true, transcriptOnly: false },
  { level: 4, name: 'transcript_first', fps: 0.5, skipGifs: true, transcriptOnly: false },
  { level: 5, name: 'safe_mode', fps: 0.2, skipGifs: true, transcriptOnly: true },
];

function getDegradationMode(retryCount: number) {
  const level = Math.min(retryCount, DEGRADATION_MODES.length - 1);
  return DEGRADATION_MODES[level];
}

// Known patterns and their auto-fixes
const KNOWN_PATTERNS = {
  file_size_too_large: {
    description: "Video file exceeds recommended size",
    autoFix: false,
    strategy: "Recommend splitting into modules",
  },
  vimeo_rate_limit: {
    description: "Vimeo API rate limit hit",
    autoFix: true,
    strategy: "Wait and retry with exponential backoff",
  },
  transcription_timeout: {
    description: "AssemblyAI transcription timed out",
    autoFix: true,
    strategy: "Retry with longer timeout",
  },
  processing_stuck: {
    description: "Processing job stuck for >30 minutes",
    autoFix: true,
    strategy: "Reset job status and retry",
  },
  storage_cleanup_failed: {
    description: "Failed to cleanup raw video file",
    autoFix: true,
    strategy: "Queue for retry cleanup",
  },
  heartbeat_stalled: {
    description: "Job exceeded expected duration without heartbeat",
    autoFix: true,
    strategy: "Force release lock and requeue with degradation",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Handle both GET (cron) and POST (manual) requests
    let action = "run-checks"; // Default action for cron jobs
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        action = body.action || "run-checks";
      } catch {
        // Empty or invalid JSON body - use default
      }
    }

    console.log(`[ops-watchdog] Action: ${action}, Method: ${req.method}`);

    switch (action) {
      // ============ RUN ALL AUTOMATED CHECKS ============
      case "run-checks": {
        const results = {
          stuckJobsFixed: 0,
          patternsDetected: 0,
          autoFixesApplied: 0,
          degradedJobs: 0,
          hardWatchdogTriggered: 0,
          pendingJobsKicked: 0,
          issues: [] as any[],
        };

        // ============ AUTONOMOUS PENDING JOB PICKUP ============
        // Critical: Pick up pending jobs that haven't been started yet
        // This ensures jobs aren't left stranded if the initial processNextStep failed
        // CRITICAL: Only process jobs for non-purged courses and non-purged queue entries
        const { data: pendingJobs } = await supabase
          .from("processing_queue")
          .select("id, course_id, step, purged, courses(email, title, purged)")
          .eq("status", "pending")
          .eq("purged", false) // Exclude purged queue entries
          .order("created_at", { ascending: true })
          .limit(10);

        // Filter out jobs for purged courses (belt + suspenders)
        const validPendingJobs = pendingJobs?.filter(job => {
          const coursePurged = (job.courses as any)?.purged === true;
          if (coursePurged) {
            console.log(`[ops-watchdog] Skipping job ${job.id} - course is purged`);
          }
          return !coursePurged;
        }) || [];

        if (validPendingJobs.length) {
          console.log(`[ops-watchdog] Found ${validPendingJobs.length} pending jobs to kick off...`);
          
          for (const job of validPendingJobs) {
            // Trigger processing by calling process-course with poll action
            try {
              const response = await fetch(`${supabaseUrl}/functions/v1/process-course`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({ action: 'poll' })
              });
              
              if (response.ok) {
                results.pendingJobsKicked++;
                console.log(`[ops-watchdog] Kicked pending job ${job.id} for course ${job.course_id}`);
              }
              
              // Only kick one batch at a time to avoid overloading
              break;
            } catch (e) {
              console.warn(`[ops-watchdog] Failed to kick pending job ${job.id}:`, e);
            }
          }
        }

        // ============ VISIBILITY TIMEOUT RECOVERY ============
        // Check for jobs with expired visibility_timeout (worker died)
        // This is the new, more reliable stall detection mechanism
        let visibilityTimeoutRecovered = 0;
        
        if (VISIBILITY_TIMEOUT_CHECK) {
          const { data: expiredJobs } = await supabase
            .from("processing_queue")
            .select("id, course_id, step, claimed_by, visibility_timeout, attempt_count, courses(email, title)")
            .eq("status", "processing")
            .eq("purged", false)
            .not("visibility_timeout", "is", null)
            .lt("visibility_timeout", new Date().toISOString())
            .limit(10);

          if (expiredJobs && expiredJobs.length > 0) {
            console.log(`[ops-watchdog] Found ${expiredJobs.length} jobs with expired visibility timeouts`);
            
            for (const job of expiredJobs) {
              const attempts = (job.attempt_count || 0);
              const maxAttempts = 5;
              
              if (attempts < maxAttempts) {
                // Reset to pending for retry
                const { error: resetError } = await supabase
                  .from("processing_queue")
                  .update({
                    status: "pending",
                    started_at: null,
                    visibility_timeout: null,
                    claimed_by: null,
                    error_message: `Visibility timeout expired (worker ${job.claimed_by || 'unknown'} died), attempt ${attempts + 1}`
                  })
                  .eq("id", job.id);

                if (!resetError) {
                  visibilityTimeoutRecovered++;
                  console.log(`[ops-watchdog] Reset expired job ${job.id} (step: ${job.step}, attempt: ${attempts + 1})`);
                  
                  // Log the recovery
                  try {
                    await supabase.from("ops_auto_fixes").insert({
                      issue_type: "visibility_timeout_expired",
                      issue_description: `Job ${job.step} visibility timeout expired, worker died`,
                      severity: "medium",
                      auto_fixed: true,
                      fix_applied: `Reset to pending for retry (attempt ${attempts + 1}/${maxAttempts})`,
                      fixed_at: new Date().toISOString(),
                      course_id: job.course_id,
                      user_email: (job.courses as any)?.email,
                      metadata: { claimed_by: job.claimed_by, step: job.step, attempt: attempts + 1 },
                    });
                  } catch {
                    // Ignore logging errors
                  }
                }
              } else {
                // Max retries - trigger manual review notification instead of hard failure
                console.log(`[ops-watchdog] Max visibility timeout retries reached for job ${job.id}, triggering manual review`);
                
                try {
                  await supabase.functions.invoke('notify-processing-failure', {
                    body: {
                      courseId: job.course_id,
                      step: job.step,
                      errorMessage: `Job failed after ${maxAttempts} visibility timeout expirations`,
                      attemptCount: maxAttempts,
                      source: 'ops-watchdog-visibility'
                    }
                  });
                } catch (notifyErr) {
                  console.error(`[ops-watchdog] Failed to notify:`, notifyErr);
                  // Fallback: still mark as manual_review
                  await supabase.from("courses").update({
                    status: "manual_review",
                    error_message: null,
                    progress_step: "manual_review",
                  }).eq("id", job.course_id);
                }

                await supabase
                  .from("processing_queue")
                  .update({
                    status: "failed",
                    visibility_timeout: null,
                    claimed_by: null,
                    error_message: `Moved to manual review after ${maxAttempts} visibility timeout expirations`
                  })
                  .eq("id", job.id);

                console.log(`[ops-watchdog] Job ${job.id} moved to manual review after max visibility timeout retries`);
              }
            }
            
            results.autoFixesApplied += visibilityTimeoutRecovered;
          }
        }

        // Check for jobs that have exceeded their expected duration based on step type
        // This is more precise than the old 30-minute blanket timeout
        
        // IMPORTANT: Skip jobs with "awaiting_webhook" status - they are waiting for external callbacks
        // and should NOT be treated as stuck
        // CRITICAL: Also filter out purged queue entries and purged courses
        const { data: processingJobs } = await supabase
          .from("processing_queue")
          .select("*, courses(id, title, email, video_duration_seconds, retry_count, purged)")
          .eq("status", "processing")
          .eq("purged", false) // Exclude purged queue entries
          .order("started_at", { ascending: true });

        // Filter out jobs for purged courses (belt + suspenders)
        const validProcessingJobs = processingJobs?.filter(job => {
          const coursePurged = (job.courses as any)?.purged === true;
          if (coursePurged) {
            console.log(`[ops-watchdog] Skipping processing job ${job.id} - course is purged`);
          }
          return !coursePurged;
        }) || [];

        if (validProcessingJobs.length) {
          console.log(`[ops-watchdog] Checking ${validProcessingJobs.length} processing jobs against SLA...`);
          
          for (const job of validProcessingJobs) {
            const stepDuration = EXPECTED_STEP_DURATIONS[job.step] || EXPECTED_STEP_DURATIONS['default'];
            const videoDuration = job.courses?.video_duration_seconds || 7200; // Default 2 hours for safety
            
            // Scale expected duration by video length (base is now 2-hour video)
            // For videos longer than 2 hours, scale proportionally with 50% buffer
            const scaleFactor = Math.max(1, (videoDuration / 7200) * 1.5);
            const expectedDuration = stepDuration * scaleFactor;
            
            // Hard SLA: 2.5x expected duration = stalled (more generous for long videos)
            const slaThreshold = expectedDuration * 2.5;
            const startedAt = new Date(job.started_at);
            const actualDuration = (Date.now() - startedAt.getTime()) / 1000;
            
            if (actualDuration > slaThreshold) {
              console.log(`[ops-watchdog] HARD SLA BREACH: Job ${job.id} step ${job.step} - expected ${expectedDuration}s, actual ${actualDuration}s`);
              
              const retryCount = (job.attempt_count || 0) + 1;
              const degradation = getDegradationMode(retryCount);
              
              // Track the pattern
              await supabase.rpc("track_pattern", {
                p_pattern_key: "heartbeat_stalled",
                p_description: `Job ${job.step} exceeded SLA: ${Math.round(actualDuration)}s > ${Math.round(slaThreshold)}s`,
                p_auto_fix_available: true,
                p_auto_fix_strategy: `Degradation level ${degradation.level}: ${degradation.name}`,
              });

              // GRACEFUL DEGRADATION instead of terminal failure
              if (degradation.level >= DEGRADATION_MODES.length - 1) {
                // Maximum degradation reached - CHECK GOVERNANCE CONSTRAINTS before failing
                console.log(`[ops-watchdog] Checking governance constraints before marking course ${job.course_id} as failed`);
                
                // Call constraint check to prevent false failures
                const constraintCheck = await supabase.functions.invoke('check-constraint-violations', {
                  body: {
                    entity_type: 'course',
                    entity_id: job.course_id,
                    proposed_operation: { 
                      operation: 'mark_failed',
                      error_message: 'Processing failed after all recovery attempts'
                    }
                  }
                });

                if (constraintCheck.data && !constraintCheck.data.valid) {
                  // Data exists - this is a recovery situation, not a failure
                  console.log(`[ops-watchdog] GOVERNANCE: Constraint violation detected - initiating recovery instead of failure`);
                  
                  // Create recovery frame
                  await supabase.functions.invoke('create-execution-frame', {
                    body: {
                      operation: 'recovery',
                      target_entity: `course:${job.course_id}`,
                      proposed_state: { status: 'processing', next_step: 'analyze_audio' },
                      initiated_by: 'ops-watchdog'
                    }
                  });
                  
                  // Queue next step instead of failing
                  const queueResult = await insertQueueEntry(supabase, job.course_id, 'analyze_audio', { 
                    recovery: true, 
                    frames_exist: true,
                    governance_recovery: true,
                    prevented_false_failure: true
                  });
                  
                  if (queueResult.success) {
                    await supabase.from("courses").update({
                      status: "processing",
                      error_message: null,
                    }).eq("id", job.course_id);
                    
                    await supabase.from("ops_auto_fixes").insert({
                      issue_type: "governance_prevented_false_failure",
                      issue_description: `Governance layer prevented false failure - data extraction completed successfully`,
                      severity: "high",
                      auto_fixed: true,
                      fix_applied: `Recovered via governance layer, queued analyze_audio`,
                      fixed_at: new Date().toISOString(),
                      course_id: job.course_id,
                      user_email: job.courses?.email,
                      metadata: { 
                        constraint_violations: constraintCheck.data.violations,
                        recovery_action: 'queue_analyze_audio'
                      },
                    });
                    
                    results.autoFixesApplied++;
                    continue; // Skip the failure path
                  }
                }
                
                // If constraint check passed (no data exists), proceed with manual_review (not failure)
                // Call the notify-processing-failure function to alert ops and reassure user
                console.log(`[ops-watchdog] Triggering manual review notification for course ${job.course_id}`);
                
                try {
                  await supabase.functions.invoke('notify-processing-failure', {
                    body: {
                      courseId: job.course_id,
                      step: job.step,
                      errorMessage: `Job timed out after ${retryCount} attempts with progressive degradation. Video may need to be split into smaller segments.`,
                      attemptCount: retryCount,
                      source: 'ops-watchdog'
                    }
                  });
                } catch (notifyErr) {
                  console.error(`[ops-watchdog] Failed to notify:`, notifyErr);
                  // Fallback: still mark as manual_review even if notification fails
                  await supabase.from("courses").update({
                    status: "manual_review",
                    error_message: null,
                    progress_step: "manual_review",
                  }).eq("id", job.course_id);
                }
                
                await supabase.from("processing_queue").update({
                  status: "failed",
                  error_message: `Moved to manual review after ${retryCount} attempts`,
                }).eq("id", job.id);
              } else {
                // Apply degradation and requeue
                await supabase.from("processing_queue").update({
                  status: "pending",
                  started_at: null,
                  attempt_count: retryCount,
                  error_message: `Auto-recovered via degradation (level ${degradation.level}: ${degradation.name})`,
                  metadata: {
                    ...(job.metadata || {}),
                    degradationLevel: degradation.level,
                    degradationMode: degradation.name,
                    targetFps: degradation.fps,
                    skipGifs: degradation.skipGifs,
                    transcriptOnly: degradation.transcriptOnly,
                    previousAttemptDuration: actualDuration,
                    recoveryReason: "hard_watchdog_sla",
                  },
                }).eq("id", job.id);

                await supabase.from("courses").update({
                  status: "queued",
                  error_message: null,
                  retry_count: retryCount,
                }).eq("id", job.course_id);

                results.degradedJobs++;
                results.hardWatchdogTriggered++;

                // Log the degradation
                await supabase.from("ops_auto_fixes").insert({
                  issue_type: "heartbeat_stalled",
                  issue_description: `Job ${job.step} exceeded SLA (${Math.round(actualDuration)}s), applying degradation level ${degradation.level}`,
                  severity: "medium",
                  auto_fixed: true,
                  fix_applied: `Degraded to ${degradation.name}: FPS=${degradation.fps}, skipGifs=${degradation.skipGifs}`,
                  fixed_at: new Date().toISOString(),
                  course_id: job.course_id,
                  user_email: job.courses?.email,
                  metadata: { degradation, actualDuration, expectedDuration },
                });
              }

              results.autoFixesApplied++;
            }
          }
        }

        // ============ LEGACY 30-MINUTE STUCK CHECK (backup) ============
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        // IMPORTANT: Also skip awaiting_webhook jobs from legacy stuck detection
        const { data: stuckJobs } = await supabase
          .from("processing_queue")
          .select("*, courses(id, title, email)")
          .eq("status", "processing")
          .neq("status", "awaiting_webhook") // Exclude webhook-waiting jobs
          .lt("started_at", thirtyMinutesAgo);

        if (stuckJobs?.length) {
          console.log(`[ops-watchdog] Found ${stuckJobs.length} legacy stuck jobs (30+ min)`);

          for (const job of stuckJobs) {
            // Skip if already handled by hard watchdog
            if (processingJobs?.some(pj => pj.id === job.id)) continue;

            await supabase.rpc("track_pattern", {
              p_pattern_key: "processing_stuck",
              p_description: `Job stuck: ${job.step} for course ${job.courses?.title}`,
              p_auto_fix_available: true,
              p_auto_fix_strategy: "Reset and retry",
            });

            const retryCount = (job.attempt_count || 0) + 1;
            const degradation = getDegradationMode(retryCount);

            await supabase.from("processing_queue").update({
              status: "pending",
              started_at: null,
              attempt_count: retryCount,
              metadata: {
                ...(job.metadata || {}),
                degradationLevel: degradation.level,
                degradationMode: degradation.name,
              },
            }).eq("id", job.id);

            await supabase.from("ops_auto_fixes").insert({
              issue_type: "processing_stuck",
              issue_description: `Job stuck on ${job.step} for ${job.courses?.title}`,
              severity: "medium",
              auto_fixed: true,
              fix_applied: `Reset job with degradation level ${degradation.level}`,
              fixed_at: new Date().toISOString(),
              course_id: job.course_id,
              user_email: job.courses?.email,
            });

            results.stuckJobsFixed++;
            results.autoFixesApplied++;
          }
        }

        // ============ STALLED WEBHOOK JOBS (5-MINUTE TIMEOUT) ============
        // For jobs awaiting webhooks (transcription/frame extraction), auto-advance after 5 minutes
        // OneDuo is frames-first - if transcription stalls, continue with frames-only mode
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        const { data: stalledWebhookJobs } = await supabase
          .from("processing_queue")
          .select("*, courses(id, title, email, frame_urls, transcript)")
          .eq("status", "awaiting_webhook")
          .in("step", ["transcribe_and_extract", "transcribe_and_extract_module"])
          .lt("started_at", fiveMinutesAgo);

        if (stalledWebhookJobs?.length) {
          console.log(`[ops-watchdog] Found ${stalledWebhookJobs.length} webhook jobs stalled >5 minutes`);
          
          for (const job of stalledWebhookJobs) {
            const hasFrames = Array.isArray(job.courses?.frame_urls) && job.courses.frame_urls.length > 0;
            
            if (hasFrames) {
              // Frames are ready - advance to next step in frames-only mode
              console.log(`[ops-watchdog] Auto-advancing stalled webhook job ${job.id}: has ${job.courses.frame_urls.length} frames`);
              
              await supabase.from("processing_queue").update({
                status: "completed",
                completed_at: new Date().toISOString(),
                error_message: "Auto-advanced by watchdog (frames-only mode)",
              }).eq("id", job.id);
              
              // Queue next step with frames-only mode
              const nextStep = job.step.includes("module") ? "analyze_audio_module" : "analyze_audio";
              const queueResult = await insertQueueEntry(supabase, job.course_id, nextStep, {
                framesOnlyMode: true,
                transcriptionSkipped: true,
                autoRecovery: true,
                detectedBy: "ops-watchdog-webhook-timeout",
              });
              
              if (queueResult.success) {
                await supabase.from("ops_auto_fixes").insert({
                  issue_type: "webhook_stalled",
                  issue_description: `Webhook job stalled >5min, advanced with ${job.courses.frame_urls.length} frames (frames-only mode)`,
                  severity: "medium",
                  auto_fixed: true,
                  fix_applied: `Queued ${nextStep} with frames-only mode`,
                  fixed_at: new Date().toISOString(),
                  course_id: job.course_id,
                  user_email: job.courses?.email,
                  metadata: { frameCount: job.courses.frame_urls.length },
                });
                
                results.autoFixesApplied++;
                results.stuckJobsFixed++;
                
                // Trigger worker to pick up
                await supabase.functions.invoke('process-course', { body: { action: 'poll' } }).catch(() => {});
              }
            } else {
              // No frames yet - use dynamic timeout based on video duration
              // Long videos (5-8+ hours) can take 60+ minutes for Replicate extraction
              // Default to 30 min timeout, scale up for very long videos
              const videoDurationSeconds = job.courses?.video_duration_seconds || 0;
              const videoDurationHours = videoDurationSeconds / 3600;
              
              // Base timeout: 30 minutes for normal videos
              // Add 15 minutes per hour of video beyond 1 hour
              // For 8+ hour videos, cap at 150 minutes (2.5 hours) to allow Replicate enough time
              const baseTimeoutMinutes = 30;
              const extraMinutesPerHour = Math.max(0, videoDurationHours - 1) * 15;
              const dynamicTimeoutMinutes = Math.min(baseTimeoutMinutes + extraMinutesPerHour, 150); // Cap at 150 min for 8+ hour videos
              
              const timeoutAgo = new Date(Date.now() - dynamicTimeoutMinutes * 60 * 1000).toISOString();
              if (new Date(job.started_at) < new Date(timeoutAgo)) {
                // Dynamic timeout reached with no frames - CHECK GOVERNANCE before failing
                console.log(`[ops-watchdog] Webhook job ${job.id} stalled ${dynamicTimeoutMinutes}+ minutes, checking governance constraints before failing`);
                
                // Double-check for data that might have arrived after initial check
                const { data: freshCourse } = await supabase.from("courses")
                  .select("frame_urls, transcript")
                  .eq("id", job.course_id)
                  .single();
                
                const hasFramesNow = Array.isArray(freshCourse?.frame_urls) && freshCourse.frame_urls.length > 0;
                const hasTranscriptNow = freshCourse?.transcript && freshCourse.transcript !== '{}';
                
                if (hasFramesNow || hasTranscriptNow) {
                  // Data arrived late - recover instead of fail
                  console.log(`[ops-watchdog] GOVERNANCE: Late data detected, recovering instead of failing`);
                  
                  await supabase.functions.invoke('create-execution-frame', {
                    body: {
                      operation: 'recovery',
                      target_entity: `course:${job.course_id}`,
                      proposed_state: { status: 'processing', reason: 'late_data_recovery' },
                      initiated_by: 'ops-watchdog'
                    }
                  });
                  
                  await supabase.from("processing_queue").update({
                    status: "completed",
                    completed_at: new Date().toISOString(),
                    error_message: "Recovered via governance layer - late data arrival",
                  }).eq("id", job.id);
                  
                  const nextStep = job.step.includes("module") ? "analyze_audio_module" : "analyze_audio";
                  await insertQueueEntry(supabase, job.course_id, nextStep, {
                    governance_recovery: true,
                    late_data_recovery: true,
                    framesOnlyMode: !hasTranscriptNow
                  });
                  
                  await supabase.from("ops_auto_fixes").insert({
                    issue_type: "governance_late_data_recovery",
                    issue_description: "Governance layer recovered job with late-arriving data",
                    severity: "medium",
                    auto_fixed: true,
                    fix_applied: `Recovered with ${freshCourse?.frame_urls?.length || 0} frames`,
                    fixed_at: new Date().toISOString(),
                    course_id: job.course_id,
                    user_email: job.courses?.email,
                  });
                  
                  results.autoFixesApplied++;
                  continue;
                }
                
                // Genuinely no data - proceed with failure
                const finalTimeoutMinutes = Math.min(30 + Math.max(0, ((job.courses?.video_duration_seconds || 0) / 3600) - 1) * 10, 60);
                console.log(`[ops-watchdog] Webhook job ${job.id} confirmed no data after ${finalTimeoutMinutes} minutes, failing`);
                
                await supabase.from("processing_queue").update({
                  status: "failed",
                  error_message: `Webhook timeout: no frames or transcript received after ${finalTimeoutMinutes} minutes`,
                }).eq("id", job.id);
                
                await supabase.from("courses").update({
                  status: "failed",
                  error_message: "Processing timed out waiting for frame extraction",
                }).eq("id", job.course_id);
                
                await supabase.from("ops_auto_fixes").insert({
                  issue_type: "webhook_timeout_failed",
                  issue_description: `Webhook job timed out with no frames after ${finalTimeoutMinutes} minutes (governance verified)`,
                  severity: "high",
                  auto_fixed: false,
                  course_id: job.course_id,
                  user_email: job.courses?.email,
                });
                
                results.issues.push({
                  type: "webhook_timeout_failed",
                  jobId: job.id,
                  courseId: job.course_id,
                });
              }
            }
          }
        }

        // ============ INTERMEDIATE STUCK COURSES ============
        const { data: stuckIntermediate, error: stuckIntermediateError } = await supabase
          .rpc('detect_stuck_intermediate_states');

        if (stuckIntermediateError) {
          console.error('[ops-watchdog] Failed detect_stuck_intermediate_states:', stuckIntermediateError);
        }

        if (stuckIntermediate?.length) {
          console.log(`[ops-watchdog] Found ${stuckIntermediate.length} intermediate-stuck courses`);

          for (const row of stuckIntermediate) {
            if (!row.next_step) continue;

            await supabase.rpc("track_pattern", {
              p_pattern_key: "intermediate_stuck",
              p_description: `Course stuck at ${row.course_status} after ${row.last_completed_step}, queueing ${row.next_step}`,
              p_auto_fix_available: true,
              p_auto_fix_strategy: "Queue missing next step",
            });

            const queueResult = await insertQueueEntry(supabase, row.course_id, row.next_step, { 
              autoRecovery: true, 
              detectedBy: 'ops-watchdog' 
            });

            if (queueResult.success) {
              await supabase.from("ops_auto_fixes").insert({
                issue_type: "intermediate_stuck",
                issue_description: `Queued missing step ${row.next_step} after ${row.last_completed_step}`,
                severity: "low",
                auto_fixed: true,
                fix_applied: "Inserted pending step to resume pipeline",
                fixed_at: new Date().toISOString(),
                course_id: row.course_id,
              });
              results.autoFixesApplied++;
            } else {
              console.error(`[ops-watchdog] CRITICAL: Failed to queue recovery for course ${row.course_id}: ${queueResult.error}`);
            }
          }
        }

        // ============ REPEATED FAILURES DETECTION ============
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const { data: recentErrors } = await supabase
          .from("error_logs")
          .select("error_type, error_message, course_id")
          .gte("created_at", oneHourAgo);

        if (recentErrors?.length) {
          const errorCounts: Record<string, number> = {};
          recentErrors.forEach(err => {
            const key = err.error_type;
            errorCounts[key] = (errorCounts[key] || 0) + 1;
          });

          for (const [errorType, count] of Object.entries(errorCounts)) {
            if (count >= 3) {
              await supabase.rpc("track_pattern", {
                p_pattern_key: `repeated_${errorType}`,
                p_description: `${errorType} error occurred ${count} times in last hour`,
                p_auto_fix_available: false,
              });
              
              results.patternsDetected++;
              results.issues.push({
                type: errorType,
                count,
                severity: count >= 5 ? "high" : "medium",
              });
            }
          }
        }

        // ============ FAILED COURSES RETRY WITH DEGRADATION ============
        const { data: failedCourses } = await supabase
          .from("courses")
          .select("id, title, email, error_message, fix_attempts, retry_count, updated_at")
          .eq("status", "failed")
          .lt("fix_attempts", 6); // Allow more attempts with degradation

        if (failedCourses?.length) {
          for (const course of failedCourses) {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const updatedAt = new Date(course.updated_at);
            
            if (updatedAt < tenMinutesAgo) {
              const errorLower = (course.error_message || "").toLowerCase();
              const isAutoFixable = 
                errorLower.includes("timeout") ||
                errorLower.includes("network") ||
                errorLower.includes("rate limit") ||
                errorLower.includes("429") ||
                errorLower.includes("503") ||
                errorLower.includes("stalled");

              if (isAutoFixable) {
                const retryCount = (course.fix_attempts || 0) + 1;
                const degradation = getDegradationMode(retryCount);
                
                console.log(`[ops-watchdog] Auto-retrying failed course: ${course.title} with degradation level ${degradation.level}`);
                
                await supabase.from("courses").update({
                  status: "queued",
                  error_message: null,
                  fix_attempts: retryCount,
                  retry_count: retryCount,
                }).eq("id", course.id);

                const queueResult = await insertQueueEntry(supabase, course.id, "transcribe", { 
                  autoRetry: true,
                  degradationLevel: degradation.level,
                  degradationMode: degradation.name,
                  targetFps: degradation.fps,
                  skipGifs: degradation.skipGifs,
                  transcriptOnly: degradation.transcriptOnly,
                });

                if (queueResult.success) {
                  await supabase.from("ops_auto_fixes").insert({
                    issue_type: "processing_error",
                    issue_description: `Auto-retrying with degradation: ${course.error_message}`,
                    severity: "low",
                    auto_fixed: true,
                    fix_applied: `Queued retry with degradation level ${degradation.level}`,
                    fixed_at: new Date().toISOString(),
                    course_id: course.id,
                    user_email: course.email,
                  });

                  results.autoFixesApplied++;
                } else {
                  console.error(`[ops-watchdog] CRITICAL: Failed to queue retry for course ${course.id}: ${queueResult.error}`);
                  // Revert the status update
                  await supabase.from("courses").update({
                    status: "failed",
                  }).eq("id", course.id);
                }
                results.degradedJobs++;
              }
            }
          }
        }

        // ============ ACTIVE_JOBS COUNTER SELF-HEALING ============
        // Detect and fix drift between reported active_jobs and actual processing jobs
        let countersHealed = 0;
        
        const { data: concurrencyDrift, error: driftError } = await supabase.rpc('detect_concurrency_drift');
        
        if (driftError) {
          console.error('[ops-watchdog] Failed detect_concurrency_drift:', driftError);
        }

        if (concurrencyDrift?.length) {
          console.log(`[ops-watchdog] Found ${concurrencyDrift.length} drifted concurrency counters`);
          
          for (const drift of concurrencyDrift) {
            console.log(`[ops-watchdog] Healing counter for ${drift.user_email}: ${drift.reported_count} -> ${drift.actual_count}`);
            
            await supabase.from("processing_concurrency").update({
              active_jobs: drift.actual_count,
              last_updated: new Date().toISOString(),
            }).eq("user_email", drift.user_email);
            
            await supabase.from("ops_auto_fixes").insert({
              issue_type: "concurrency_counter_drift",
              issue_description: `Counter drift: reported ${drift.reported_count} but actual ${drift.actual_count}`,
              severity: drift.reported_count > 3 ? "high" : "low",
              auto_fixed: true,
              fix_applied: `Reset active_jobs from ${drift.reported_count} to ${drift.actual_count}`,
              fixed_at: new Date().toISOString(),
              user_email: drift.user_email,
            });
            
            await supabase.rpc("track_pattern", {
              p_pattern_key: "concurrency_counter_drift",
              p_description: `User ${drift.user_email} had stale counter (${drift.reported_count} -> ${drift.actual_count})`,
              p_auto_fix_available: true,
              p_auto_fix_strategy: "Auto-reset to actual processing count",
            });
            
            countersHealed++;
            results.autoFixesApplied++;
          }
        }

        // ============ CLEANUP ============
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("rate_limits").delete().lt("window_start", oneDayAgo);

        console.log(`[ops-watchdog] Results:`, { ...results, countersHealed });

        return new Response(JSON.stringify({ 
          success: true,
          results: { ...results, countersHealed },
          message: `Watchdog complete: ${results.autoFixesApplied} auto-fixes, ${results.degradedJobs} degraded, ${countersHealed} counters healed, ${results.pendingJobsKicked} pending kicked`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ GET OPS DASHBOARD DATA ============
      case "get-dashboard": {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: recentFixes } = await supabase
          .from("ops_auto_fixes")
          .select("*")
          .gte("detected_at", oneDayAgo)
          .order("detected_at", { ascending: false })
          .limit(20);

        const { data: patterns } = await supabase
          .from("ops_patterns")
          .select("*")
          .order("occurrence_count", { ascending: false })
          .limit(10);

        const { data: processingCourses } = await supabase
          .from("courses")
          .select("id, title, status, progress, retry_count")
          .not("status", "in", '("completed","failed")')
          .order("created_at", { ascending: false });

        // Count degraded jobs in last 24 hours
        const degradedCount = recentFixes?.filter(f => 
          f.fix_applied?.includes('degradation')
        ).length || 0;

        return new Response(JSON.stringify({
          recentFixes,
          patterns,
          processingCourses,
          summary: {
            totalFixesToday: recentFixes?.length || 0,
            activeProcessing: processingCourses?.length || 0,
            topPattern: patterns?.[0]?.pattern_key || "none",
            degradedJobsToday: degradedCount,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err: any) {
    console.error("[ops-watchdog] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});