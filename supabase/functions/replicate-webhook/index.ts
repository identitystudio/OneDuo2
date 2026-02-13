import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-replicate-signature",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Replicate Webhook Handler
 * 
 * This endpoint receives callbacks from Replicate when frame extraction jobs complete.
 * It eliminates the need for long-polling inside the main process-course function,
 * making the system more robust for long videos (2+ hours).
 * 
 * CRITICAL: Frame URLs from Replicate are TEMPORARY (expire in ~24h).
 * We immediately persist all frames to permanent Supabase Storage before storing URLs.
 * 
 * Flow:
 * 1. process-course starts a Replicate prediction with webhook URL pointing here
 * 2. process-course returns immediately (no blocking poll loop)
 * 3. Replicate calls this webhook when extraction completes
 * 4. THIS WEBHOOK PERSISTS FRAMES TO PERMANENT STORAGE (critical fix for PDF generation)
 * 5. This webhook updates the DB with permanent URLs and queues the next processing step
 */

// Log to job_logs table for forensic debugging
async function logJobEvent(
  supabase: any,
  jobId: string,
  payload: { step: string; level?: string; message?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  try {
    await supabase.from('job_logs').insert({
      job_id: jobId,
      step: payload.step,
      level: payload.level || 'info',
      message: payload.message || null,
      metadata: {
        ...payload.metadata,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (e) {
    console.warn(`[logJobEvent] Failed to log event for ${jobId}:`, e);
  }
}

/**
 * CRITICAL: Persist a single frame from Replicate CDN to Supabase Storage
 * Replicate URLs expire within hours - we MUST persist immediately
 */
async function persistFrameToStorage(
  supabase: any,
  courseId: string,
  cdnUrl: string,
  frameIndex: number
): Promise<string | null> {
  try {
    const response = await fetch(cdnUrl, {
      headers: { 'Accept': 'image/*' },
    });

    if (!response.ok) {
      console.warn(`[persistFrame] Fetch failed for frame ${frameIndex}: ${response.status}`);
      return null;
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';

    const storagePath = `frames/${courseId}/frame-${String(frameIndex).padStart(5, '0')}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('course-videos')
      .upload(storagePath, imageBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.warn(`[persistFrame] Upload failed for frame ${frameIndex}:`, uploadError.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('course-videos')
      .getPublicUrl(storagePath);

    return publicUrlData?.publicUrl || null;
  } catch (error) {
    console.error(`[persistFrame] Error processing frame ${frameIndex}:`, error);
    return null;
  }
}
/**
 * CRITICAL: Persist frames from Replicate to permanent storage
 * This runs immediately when the webhook receives extracted frames.
 * 
 * DYNAMIC FRAME LIMITS: Scale frame count with video duration to ensure
 * proportional visual coverage. Longer videos get proportionally more frames.
 * 
 * Target density: ~2-3 frames per minute of video (max ~500 pages for 4hr video)
 * - 1 hour video: ~180 frames → ~90 pages  
 * - 2 hour video: ~360 frames → ~180 pages
 * - 4 hour video: ~720 frames → ~360 pages
 */
const BATCH_SIZE = 50; // Process 50 frames at a time for efficiency
const FRAMES_PER_MINUTE = 2.5; // Target density for PDF legibility
const MIN_FRAMES = 100; // Minimum for any video
const MAX_FRAMES = 2000; // Cap for 8+ hour videos (~1200 frames at 8hr)

/**
 * Calculate optimal frame count based on video duration
 */
function calculateOptimalFrameCount(durationSeconds: number | null): number {
  if (!durationSeconds || durationSeconds <= 0) {
    return 600; // Default fallback
  }

  const durationMinutes = durationSeconds / 60;
  const targetFrames = Math.ceil(durationMinutes * FRAMES_PER_MINUTE);

  // Clamp between min and max
  return Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, targetFrames));
}

async function persistAllFramesToStorage(
  supabase: any,
  courseId: string,
  replicateUrls: string[],
  logJobId: string,
  videoDurationSeconds?: number
): Promise<{ persistedUrls: string[]; failedCount: number; skippedCount: number }> {
  const persistedUrls: string[] = [];
  let failedCount = 0;
  let skippedCount = 0;

  // Calculate dynamic frame limit based on video duration
  const maxFramesForVideo = calculateOptimalFrameCount(videoDurationSeconds || null);

  console.log(`[replicate-webhook] Video duration: ${videoDurationSeconds ? Math.round(videoDurationSeconds / 60) : 'unknown'} min, target frames: ${maxFramesForVideo}`);

  // Sample evenly if we have more frames than our target
  let urlsToPersist = replicateUrls;
  if (replicateUrls.length > maxFramesForVideo) {
    // Sample evenly across the entire video for proportional coverage
    const step = replicateUrls.length / maxFramesForVideo;
    urlsToPersist = [];
    for (let i = 0; i < maxFramesForVideo; i++) {
      const idx = Math.floor(i * step);
      urlsToPersist.push(replicateUrls[idx]);
    }
    skippedCount = replicateUrls.length - maxFramesForVideo;
    console.log(`[replicate-webhook] Sampled ${maxFramesForVideo} of ${replicateUrls.length} frames (proportional to ${Math.round((videoDurationSeconds || 0) / 60)} min video)`);
  }

  console.log(`[replicate-webhook] Persisting ${urlsToPersist.length} frames to permanent storage...`);

  for (let i = 0; i < urlsToPersist.length; i += BATCH_SIZE) {
    const batch = urlsToPersist.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((url, batchIdx) =>
        persistFrameToStorage(supabase, courseId, url, i + batchIdx)
      )
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        persistedUrls.push(result.value);
      } else {
        failedCount++;
      }
    }

    // Progress log every 100 frames
    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= urlsToPersist.length) {
      console.log(`[replicate-webhook] Persist progress: ${Math.min(i + BATCH_SIZE, urlsToPersist.length)}/${urlsToPersist.length}`);
    }
  }

  console.log(`[replicate-webhook] Frame persistence complete: ${persistedUrls.length}/${urlsToPersist.length} succeeded, ${failedCount} failed`);

  // Log the persistence result
  await logJobEvent(supabase, logJobId, {
    step: 'frame_persistence_complete',
    level: failedCount > 0 ? 'warn' : 'info',
    message: `Persisted ${persistedUrls.length}/${replicateUrls.length} frames (sampled from ${replicateUrls.length} total)`,
    metadata: {
      total_extracted_frames: replicateUrls.length,
      target_frames: maxFramesForVideo,
      persisted_count: persistedUrls.length,
      failed_count: failedCount,
      skipped_count: skippedCount,
      video_duration_minutes: videoDurationSeconds ? Math.round(videoDurationSeconds / 60) : null,
      frames_per_minute: videoDurationSeconds ? (persistedUrls.length / (videoDurationSeconds / 60)).toFixed(2) : null,
      success_rate: `${Math.round((persistedUrls.length / urlsToPersist.length) * 100)}%`
    }
  });

  return { persistedUrls, failedCount, skippedCount };
}

// Queue the next processing step
async function queueNextStep(
  supabase: any,
  courseId: string,
  nextStep: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const { error } = await supabase.from("processing_queue").insert({
      course_id: courseId,
      step: nextStep,
      status: "pending",
      metadata,
    });

    if (error) {
      console.error(`[queueNextStep] Failed to queue ${nextStep}:`, error);
      return false;
    }

    console.log(`[queueNextStep] Queued ${nextStep} for course ${courseId}`);
    return true;
  } catch (e) {
    console.error(`[queueNextStep] Exception:`, e);
    return false;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the webhook payload
    const body = await req.json();
    console.log(`[replicate-webhook] Received webhook:`, JSON.stringify(body).substring(0, 500));

    // Extract prediction info
    const predictionId = body.id;
    const status = body.status; // "starting", "processing", "succeeded", "failed", "canceled"
    const output = body.output; // Array of frame URLs when succeeded
    const error = body.error;

    // Get our custom metadata that we passed when creating the prediction
    // This contains courseId, moduleId, recordId, tableName, etc.
    const webhookMeta = body.input?.webhook_metadata || {};
    const { courseId, moduleId: _moduleId, recordId, tableName, fps: _fps, step } = webhookMeta;

    if (!courseId || !recordId || !tableName) {
      console.error(`[replicate-webhook] Missing required metadata in webhook`);
      // Still return 200 to acknowledge receipt (prevent Replicate retries for malformed request)
      return new Response(JSON.stringify({
        received: true,
        error: "Missing metadata - webhook ignored"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logJobId = tableName === 'courses'
      ? `course-${courseId.slice(0, 8)}`
      : `module-${recordId.slice(0, 8)}`;

    // Log webhook receipt
    await logJobEvent(supabase, logJobId, {
      step: 'replicate_webhook_received',
      level: 'info',
      message: `Replicate webhook received: ${status}`,
      metadata: {
        prediction_id: predictionId,
        status,
        course_id: courseId,
        record_id: recordId,
        table_name: tableName,
        has_output: !!output,
        frame_count: output?.length || 0,
      }
    });

    // Handle different statuses
    if (status === "succeeded") {
      const replicateFrameUrls = output || [];
      console.log(`[replicate-webhook] Extraction succeeded: ${replicateFrameUrls.length} frames from Replicate`);

      // ========== IDEMPOTENT FRAME UPDATE (Safeguard #1) ==========
      // Always update frame_urls even if job is marked completed.
      // This ensures late-arriving webhooks or recovery scenarios still persist frames.
      const { data: currentRecord } = await supabase.from(tableName)
        .select("status, frame_urls, progress")
        .eq("id", recordId)
        .single();

      const existingFrameCount = Array.isArray(currentRecord?.frame_urls) ? currentRecord.frame_urls.length : 0;
      const isAlreadyCompleted = currentRecord?.status === 'completed';

      // IDEMPOTENT: Skip only if completed AND has adequate frames
      // If completed but missing frames, proceed with recovery
      if (isAlreadyCompleted && existingFrameCount >= replicateFrameUrls.length) {
        console.log(`[replicate-webhook] IDEMPOTENT SKIP: Course already completed with ${existingFrameCount} frames (webhook has ${replicateFrameUrls.length}). Skipping.`);
        return new Response(JSON.stringify({
          received: true,
          skipped: true,
          reason: 'course_already_completed_with_adequate_frames',
          existing_frames: existingFrameCount,
          webhook_frames: replicateFrameUrls.length
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If completed but MISSING frames - this is recovery mode
      if (isAlreadyCompleted && existingFrameCount < replicateFrameUrls.length) {
        console.log(`[replicate-webhook] RECOVERY MODE: Course completed but only has ${existingFrameCount} frames, webhook has ${replicateFrameUrls.length}. Persisting frames now.`);
        await logJobEvent(supabase, logJobId, {
          step: 'idempotent_frame_recovery',
          level: 'warn',
          message: `Recovering frames for completed course: existing ${existingFrameCount}, webhook ${replicateFrameUrls.length}`,
          metadata: { existing_frames: existingFrameCount, webhook_frames: replicateFrameUrls.length }
        });
      }

      // ========== CRITICAL FIX: PERSIST FRAMES IMMEDIATELY ==========
      // Replicate CDN URLs expire within ~24 hours.
      // We MUST persist all frames to Supabase Storage NOW before the URLs expire.
      // This prevents the "7 page PDF" bug where most frames return 404 during PDF generation.

      // Fetch video duration to calculate optimal frame count
      let videoDurationSeconds: number | undefined;
      if (tableName === 'courses') {
        const { data: courseData } = await supabase.from('courses')
          .select('video_duration_seconds')
          .eq('id', recordId)
          .single();
        videoDurationSeconds = courseData?.video_duration_seconds;
      } else {
        const { data: moduleData } = await supabase.from('course_modules')
          .select('video_duration_seconds')
          .eq('id', recordId)
          .single();
        videoDurationSeconds = moduleData?.video_duration_seconds;
      }

      console.log(`[replicate-webhook] Video duration for frame calculation: ${videoDurationSeconds ? Math.round(videoDurationSeconds / 60) + ' min' : 'unknown'}`);

      // Update progress (DO NOT use 'persisting_frames' - not in valid_progress_step constraint)
      // GUARD: Don't regress progress if already higher (e.g. course already at 100%)
      // CRITICAL: Always update last_heartbeat_at to prevent false "stalled" detection
      if (!isAlreadyCompleted) {
        await supabase.from(tableName).update({
          progress: 40,
          last_heartbeat_at: new Date().toISOString(),
          // Keep progress_step as 'extracting_frames' - the UI shows "Saving frames" at 40%+
        }).eq("id", recordId);
      }

      // Persist all frames to permanent storage - DYNAMIC COUNT based on video duration
      const { persistedUrls, failedCount } = await persistAllFramesToStorage(
        supabase,
        courseId,
        replicateFrameUrls,
        logJobId,
        videoDurationSeconds
      );

      // Use the PERMANENT Supabase Storage URLs, not the temporary Replicate URLs
      const frameUrls = persistedUrls;

      // ========== SAFEGUARD #4: LOG + ALERT ON DB UPDATE FAILURES ==========
      // Track whether DB update succeeds after frame persistence
      let _dbUpdateSucceeded = false;
      let _dbUpdateError: string | null = null;

      if (frameUrls.length === 0) {
        // All frames failed to persist - this is a critical failure
        console.error(`[replicate-webhook] CRITICAL: All ${replicateFrameUrls.length} frames failed to persist!`);

        await logJobEvent(supabase, logJobId, {
          step: 'frame_persistence_failed',
          level: 'error',
          message: `All ${replicateFrameUrls.length} frames failed to persist - falling back to Replicate URLs (may expire)`,
          metadata: {
            prediction_id: predictionId,
            replicate_frame_count: replicateFrameUrls.length,
          }
        });

        // FALLBACK: Use Replicate URLs anyway (better than nothing, may work if downloaded soon)
        const { error: fallbackError } = await supabase.from(tableName).update({
          frame_urls: replicateFrameUrls,
          total_frames: replicateFrameUrls.length,
          progress: isAlreadyCompleted ? currentRecord.progress : 50,
          constraint_status: 'pending_check', // Needs re-persistence
        }).eq("id", recordId);

        if (fallbackError) {
          _dbUpdateError = fallbackError.message;
          console.error(`[replicate-webhook] CRITICAL ALERT: Frames available but DB update FAILED:`, fallbackError.message);

          // ========== SAFEGUARD #4: HIGH-SEVERITY LOGGING ==========
          await logJobEvent(supabase, logJobId, {
            step: 'db_update_failed_after_persistence',
            level: 'error',
            message: `CRITICAL SILENT FAILURE: ${replicateFrameUrls.length} frames ready but DB update failed: ${fallbackError.message}`,
            metadata: {
              frame_count: replicateFrameUrls.length,
              db_error: fallbackError.message,
              recovery_action_needed: true,
              course_id: courseId
            }
          });

          // Insert critical constraint violation for ops visibility
          try {
            await supabase.from("constraint_violations").insert({
              entity_type: 'course',
              entity_id: courseId,
              constraint_name: 'db_update_after_frame_persistence',
              violation_type: 'silent_failure',
              expected_state: { frame_urls_count: replicateFrameUrls.length },
              actual_state: { db_error: fallbackError.message, frames_available: true },
              severity: 'critical'
            });
          } catch { /* ignore */ }
        } else {
          _dbUpdateSucceeded = true;
        }
      } else {
        // SUCCESS: Store the permanent URLs
        console.log(`[replicate-webhook] Stored ${frameUrls.length} permanent frame URLs (${failedCount} failed)`);

        const { error: updateError } = await supabase.from(tableName).update({
          frame_urls: frameUrls,
          total_frames: frameUrls.length,
          progress: isAlreadyCompleted ? currentRecord.progress : 50,
          constraint_status: 'valid', // Frames persisted successfully
        }).eq("id", recordId);

        if (updateError) {
          const _dbUpdateError = updateError.message;
          console.error(`[replicate-webhook] CRITICAL ALERT: ${frameUrls.length} frames persisted but DB update FAILED:`, updateError.message);

          // ========== SAFEGUARD #4: HIGH-SEVERITY LOGGING ==========
          await logJobEvent(supabase, logJobId, {
            step: 'db_update_failed_after_persistence',
            level: 'error',
            message: `CRITICAL SILENT FAILURE: ${frameUrls.length} frames persisted to storage but DB update failed: ${updateError.message}`,
            metadata: {
              persisted_frame_count: frameUrls.length,
              db_error: updateError.message,
              recovery_action_needed: true,
              course_id: courseId,
              first_frame_url: frameUrls[0]?.substring(0, 100)
            }
          });

          // Insert critical constraint violation
          try {
            await supabase.from("constraint_violations").insert({
              entity_type: 'course',
              entity_id: courseId,
              constraint_name: 'db_update_after_frame_persistence',
              violation_type: 'silent_failure',
              expected_state: { frame_urls_count: frameUrls.length },
              actual_state: { db_error: updateError.message, frames_persisted_to_storage: true },
              severity: 'critical'
            });
          } catch { /* ignore */ }

          // RETRY: Try without constraint_status in case that's the issue
          const { error: retryError } = await supabase.from(tableName).update({
            frame_urls: frameUrls,
            total_frames: frameUrls.length,
          }).eq("id", recordId);

          if (!retryError) {
            _dbUpdateSucceeded = true;
            console.log(`[replicate-webhook] Retry succeeded: frame_urls updated without constraint_status`);
            await logJobEvent(supabase, logJobId, {
              step: 'db_update_retry_succeeded',
              level: 'info',
              message: `DB update retry succeeded after removing constraint_status`,
              metadata: { frame_count: frameUrls.length }
            });
          } else {
            console.error(`[replicate-webhook] Retry also failed:`, retryError.message);
          }
        } else {
          _dbUpdateSucceeded = true;
        }
      }

      // Log completion
      await logJobEvent(supabase, logJobId, {
        step: 'frame_extraction_complete',
        level: 'info',
        message: `Frame extraction completed via webhook: ${frameUrls.length} permanent frames stored`,
        metadata: {
          prediction_id: predictionId,
          replicate_frame_count: replicateFrameUrls.length,
          persisted_frame_count: frameUrls.length,
          failed_count: failedCount,
          persistence_success_rate: `${Math.round((frameUrls.length / Math.max(replicateFrameUrls.length, 1)) * 100)}%`,
        }
      });
      // Mark the current queue job as completed
      // FIX: Accept both 'awaiting_webhook' and 'processing' status to handle race conditions
      const { data: updatedRows, error: _queueUpdateError } = await supabase.from("processing_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("course_id", courseId)
        .in("status", ["awaiting_webhook", "processing"])
        .in("step", ["extract_frames", "extract_frames_module", "transcribe_and_extract", "transcribe_and_extract_module"])
        .select("id");

      // Log if no rows were updated (indicates potential issue)
      if (!updatedRows || updatedRows.length === 0) {
        console.warn(`[replicate-webhook] WARNING: Queue job update affected 0 rows for course ${courseId}`);
        await logJobEvent(supabase, logJobId, {
          step: 'queue_update_zero_rows',
          level: 'warn',
          message: `Queue job completion update affected 0 rows - possible status mismatch`,
          metadata: { course_id: courseId, attempted_statuses: ['awaiting_webhook', 'processing'] }
        });
      } else {
        console.log(`[replicate-webhook] Marked ${updatedRows.length} queue job(s) as completed`);
      }
      // Queue the next step based on what step triggered this
      let nextStep = "analyze_audio";
      if (step?.includes("module")) {
        nextStep = "analyze_audio_module";
      }

      // FIX: Update progress_step AND last_heartbeat_at on courses table
      // This keeps the dashboard progress bar in sync with actual state
      // CRITICAL: Update last_heartbeat_at to prevent false "stalled" detection
      await supabase.from(tableName).update({
        progress_step: "transcribing",
        last_heartbeat_at: new Date().toISOString(),
      }).eq("id", recordId);

      // For transcribe_and_extract steps, check transcription status
      // FRAMES-ONLY MODE: If transcription failed or skipped, continue anyway
      // OneDuo is a visual emphasis system - transcription is optional context
      const { data: record } = await supabase.from(tableName)
        .select("transcript, video_duration_seconds")
        .eq("id", recordId)
        .single();

      // CRITICAL FIX: Check actual data presence, not step_completed flags
      // step_completed only exists on course_modules, not courses table
      const hasTranscript = Array.isArray(record?.transcript) && record.transcript.length > 0;

      // For single videos (courses table), we can proceed if:
      // 1. We have transcript data, OR
      // 2. This is a frames-only extraction step (extract_frames)
      // For transcribe_and_extract, we NEED transcript OR timeout/failure signal
      // Since we can't track step_completed on courses, check if transcript exists
      const canProceed = hasTranscript ||
        step === "extract_frames" ||
        step === "extract_frames_module";
      if (canProceed) {
        // Ready to proceed to next step
        const moduleNumber = webhookMeta.moduleNumber;
        const framesOnlyMode = !hasTranscript;

        // CRITICAL FIX: Check if analyze_audio already completed - prevent duplicate queue jobs
        const { data: existingJob } = await supabase
          .from("processing_queue")
          .select("id, status")
          .eq("course_id", courseId)
          .eq("step", nextStep)
          .in("status", ["completed", "processing", "pending"])
          .eq("purged", false)
          .maybeSingle();

        if (existingJob) {
          console.log(`[replicate-webhook] ${nextStep} already exists (status: ${existingJob.status}), skipping queue`);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'step_already_exists' }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // FIX: Update progress_step to 'analyzing' before queuing next step
        await supabase.from(tableName).update({
          progress_step: "analyzing",
        }).eq("id", recordId);

        console.log(`[replicate-webhook] Proceeding to ${nextStep}. Frames-only mode: ${framesOnlyMode}`);

        await queueNextStep(supabase, courseId, nextStep, {
          moduleNumber,
          completedViaWebhook: true,
          framesOnlyMode,
          transcriptionSkipped: framesOnlyMode
        });

        // Trigger the worker to pick up the new job
        await supabase.functions.invoke('process-course', {
          body: { action: 'poll' }
        }).catch(() => { }); // Fire-and-forget
      } else {
        // Transcript not ready yet - check again after a brief delay
        // For short videos, transcription usually finishes quickly
        console.log(`[replicate-webhook] Frames ready but transcript not yet available. Will poll for transcript...`);

        // Poll for transcript up to 30 seconds (transcription for short videos is fast)
        let transcriptReady = false;
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds

          const { data: recheckRecord } = await supabase.from(tableName)
            .select("transcript")
            .eq("id", recordId)
            .single();

          if (Array.isArray(recheckRecord?.transcript) && recheckRecord.transcript.length > 0) {
            transcriptReady = true;
            console.log(`[replicate-webhook] Transcript now available after ${(i + 1) * 5}s delay`);
            break;
          }
        }

        if (transcriptReady) {
          console.log(`[replicate-webhook] Proceeding to ${nextStep} after transcript became available`);
          await queueNextStep(supabase, courseId, nextStep, {
            moduleNumber: webhookMeta.moduleNumber,
            completedViaWebhook: true,
          });
          await supabase.functions.invoke('process-course', { body: { action: 'poll' } }).catch(() => { });
        } else {
          // Still no transcript after 30s - proceed in frames-only mode
          console.log(`[replicate-webhook] Transcript timeout - proceeding in frames-only mode`);
          await queueNextStep(supabase, courseId, nextStep, {
            moduleNumber: webhookMeta.moduleNumber,
            completedViaWebhook: true,
            framesOnlyMode: true,
            transcriptionSkipped: true
          });
          await supabase.functions.invoke('process-course', { body: { action: 'poll' } }).catch(() => { });

          await logJobEvent(supabase, logJobId, {
            step: 'frames_proceeding_without_transcript',
            level: 'warn',
            message: 'Proceeding without transcript after 30s timeout',
            metadata: { course_id: courseId, record_id: recordId }
          });
        }
      }
      return new Response(JSON.stringify({
        received: true,
        status: "processed",
        frames_stored: frameUrls.length
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (status === "failed" || status === "canceled") {
      console.error(`[replicate-webhook] Extraction failed:`, error);

      // Log failure
      await logJobEvent(supabase, logJobId, {
        step: 'frame_extraction_failed',
        level: 'error',
        message: `Frame extraction failed via webhook: ${error || status}`,
        metadata: {
          prediction_id: predictionId,
          status,
          error: error || status,
        }
      });

      // Update queue job as failed
      // FIX: Accept both 'awaiting_webhook' and 'processing' status
      const { data: failedRows } = await supabase.from("processing_queue")
        .update({
          status: "failed",
          error_message: error || `Replicate ${status}`
        })
        .eq("course_id", courseId)
        .in("status", ["awaiting_webhook", "processing"])
        .select("id");

      if (!failedRows || failedRows.length === 0) {
        console.warn(`[replicate-webhook] WARNING: Failed job update affected 0 rows for course ${courseId}`);
      }

      // Trigger manual review notification instead of hard failure
      console.log(`[replicate-webhook] Triggering manual review notification for course ${courseId}`);
      try {
        await supabase.functions.invoke('notify-processing-failure', {
          body: {
            courseId: courseId,
            step: step || 'extract_frames',
            errorMessage: `Frame extraction failed: ${error || status}`,
            attemptCount: 1,
            source: 'replicate-webhook'
          }
        });
      } catch (notifyErr) {
        console.error(`[replicate-webhook] Failed to notify:`, notifyErr);
        // Fallback: still update to manual_review
        await supabase.from(tableName).update({
          status: "manual_review",
          error_message: null,
          progress_step: "manual_review",
        }).eq("id", recordId);
      }

      return new Response(JSON.stringify({
        received: true,
        status: "failed",
        error: error || status
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      // ============ GOVERNANCE: Race condition detection ============
      // After any status update, check if course was incorrectly marked failed while we have data
    } else if (status === "succeeded") {
      // Already handled above, but double-check for race condition recovery
      const { data: currentCourse } = await supabase
        .from("courses")
        .select("status, frame_urls, transcript")
        .eq("id", courseId)
        .single();

      if (currentCourse?.status === 'failed' &&
        Array.isArray(currentCourse.frame_urls) &&
        currentCourse.frame_urls.length > 0) {
        console.log(`[replicate-webhook] GOVERNANCE: Race condition detected - frames extracted but course marked failed`);

        // Log constraint violation
        await supabase.from("constraint_violations").insert({
          entity_type: 'course',
          entity_id: courseId,
          constraint_name: 'race_condition_webhook_vs_watchdog',
          violation_type: 'race_condition',
          expected_state: { status: 'processing' },
          actual_state: { status: 'failed', frames_exist: true, frame_count: currentCourse.frame_urls.length },
          severity: 'critical'
        });

        // Create recovery frame via governance layer
        await supabase.functions.invoke('create-execution-frame', {
          body: {
            operation: 'recovery',
            target_entity: `course:${courseId}`,
            proposed_state: { status: 'processing', reason: 'race_condition_recovery' },
            initiated_by: 'replicate-webhook'
          }
        });

        // Reset to processing and queue next step
        await supabase.from("courses").update({
          status: 'processing',
          error_message: null,
          constraint_status: 'valid'
        }).eq("id", courseId);

        const nextStep = step?.includes("module") ? "analyze_audio_module" : "analyze_audio";
        await queueNextStep(supabase, courseId, nextStep, {
          recovery_from_race_condition: true,
          governance_recovery: true,
          frame_count: currentCourse.frame_urls.length
        });

        // Log the recovery
        await logJobEvent(supabase, logJobId, {
          step: 'governance_race_condition_recovery',
          level: 'warn',
          message: `Governance layer recovered race condition: ${currentCourse.frame_urls.length} frames rescued`,
          metadata: { course_id: courseId, frame_count: currentCourse.frame_urls.length }
        });

        // Trigger worker to pick up
        await supabase.functions.invoke('process-course', { body: { action: 'poll' } }).catch(() => { });
      }

      return new Response(JSON.stringify({
        received: true,
        status: "processed",
        governance_check: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      // Status is "starting" or "processing" - just acknowledge
      console.log(`[replicate-webhook] Intermediate status: ${status}`);

      return new Response(JSON.stringify({
        received: true,
        status: "acknowledged"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error) {
    console.error("[replicate-webhook] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Still return 200 to acknowledge receipt (prevent infinite retries)
    return new Response(JSON.stringify({
      received: true,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
