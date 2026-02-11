import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface ModuleInput {
  title: string;
  videoUrl: string;
  moduleNumber: number;
}

// ============ PRODUCTION HARDENING HELPERS ============

// Heartbeat interval for long-running jobs (update every 30 seconds for 2+ hour videos)
// More frequent heartbeats prevent watchdog from falsely marking as stalled
const HEARTBEAT_INTERVAL_MS = 30000;
// Lease duration - 10 minutes, renewed every heartbeat (longer for 2+ hour videos)
const LEASE_DURATION_SECONDS = 600;

// ============ STRUCTURED JOB LOGGING ============
// Logs to job_logs table for forensic debugging of stalled/failed jobs

interface JobLogPayload {
  step: string;
  level?: 'info' | 'warn' | 'error';
  message?: string;
  errorReason?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
}

async function logJobEvent(
  supabase: any,
  jobId: string,
  payload: JobLogPayload
): Promise<void> {
  try {
    await supabase.from('job_logs').insert({
      job_id: jobId,
      step: payload.step,
      level: payload.level || 'info',
      message: payload.message || null,
      error_reason: payload.errorReason || null,
      error_stack: payload.errorStack || null,
      metadata: {
        ...payload.metadata,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (e) {
    console.warn(`[logJobEvent] Failed to log event for ${jobId}:`, e);
  }
}

// Generate a job ID from course/module IDs for consistent logging
function getJobIdForCourse(courseId: string): string {
  return courseId;
}

function getJobIdForModule(courseId: string, _moduleNumber: number): string {
  return courseId;
}

// Generate unique worker ID for lease tracking
function generateWorkerId(): string {
  return `worker-${crypto.randomUUID().slice(0, 8)}-${Date.now()}`;
}

// Check concurrency limits before starting a job
async function checkConcurrencyLimits(supabase: any, userEmail: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('can_start_job', { p_user_email: userEmail });
    if (error) {
      console.warn('[concurrency] Failed to check limits:', error);
      return true; // Allow on error to avoid blocking
    }
    return data === true;
  } catch {
    return true; // Allow on error
  }
}

// Increment active job count for user
async function incrementActiveJobs(supabase: any, userEmail: string): Promise<void> {
  try {
    await supabase.rpc('increment_active_jobs', { p_user_email: userEmail });
  } catch (e) {
    console.warn('[concurrency] Failed to increment:', e);
  }
}

// Decrement active job count for user
async function decrementActiveJobs(supabase: any, userEmail: string): Promise<void> {
  try {
    await supabase.rpc('decrement_active_jobs', { p_user_email: userEmail });
  } catch (e) {
    console.warn('[concurrency] Failed to decrement:', e);
  }
}

// Update heartbeat for a course (keeps watchdog from marking as stalled)
async function updateCourseHeartbeat(supabase: any, courseId: string): Promise<void> {
  try {
    await supabase.rpc('update_course_heartbeat', { p_course_id: courseId });
  } catch {
    // Ignore heartbeat errors
  }
}

// Update heartbeat for a module
async function updateModuleHeartbeat(supabase: any, moduleId: string): Promise<void> {
  try {
    await supabase.rpc('update_module_heartbeat', { p_module_id: moduleId });
  } catch {
    // Ignore heartbeat errors
  }
}

// ============ MONITORED QUEUE INSERTION WITH RETRIES ============

// Queue insertion with constraint violation monitoring and automatic retries
const MAX_QUEUE_INSERT_RETRIES = 3;
const QUEUE_INSERT_BACKOFF_MS = [500, 1500, 3000]; // Exponential backoff

async function insertQueueEntry(
  supabase: any,
  courseId: string,
  step: string,
  metadata?: any
): Promise<{ success: boolean; error?: string; jobId?: string }> {

  for (let attempt = 0; attempt < MAX_QUEUE_INSERT_RETRIES; attempt++) {
    try {
      // GUARD: Check if course is already completed - prevent reprocessing bug
      const { data: course } = await supabase
        .from("courses")
        .select("status, purged")
        .eq("id", courseId)
        .single();

      if (course?.status === 'completed') {
        console.log(`[queue-insert] SKIPPED: course ${courseId} already completed, won't insert ${step}`);
        return { success: true }; // Return success to not trigger error handling
      }

      if (course?.purged === true) {
        console.log(`[queue-insert] SKIPPED: course ${courseId} is purged, won't insert ${step}`);
        return { success: true };
      }

      // Check for existing pending/processing job for this step to avoid duplicates
      const { data: existingJob } = await supabase
        .from("processing_queue")
        .select("id, status")
        .eq("course_id", courseId)
        .eq("step", step)
        .in("status", ["pending", "processing", "awaiting_webhook"])
        .eq("purged", false)
        .maybeSingle();

      if (existingJob) {
        console.log(`[queue-insert] SKIPPED: job already exists for course ${courseId}, step ${step} (id: ${existingJob.id}, status: ${existingJob.status})`);
        return { success: true, jobId: existingJob.id };
      }

      const { data, error } = await supabase.from("processing_queue").insert({
        course_id: courseId,
        step: step,
        status: "pending",
        metadata: metadata || {},
      }).select().single();

      if (error) {
        const errorMessage = error.message || 'Unknown queue insertion error';
        const isConstraintViolation = errorMessage.includes('violates check constraint') ||
          errorMessage.includes('constraint') ||
          errorMessage.includes('duplicate');

        // If it's a duplicate/constraint error, that's actually okay - job exists
        if (isConstraintViolation) {
          console.log(`[queue-insert] Constraint hit for course ${courseId}, step ${step} - job likely exists`);
          return { success: true };
        }

        // Transient error - retry with backoff
        if (attempt < MAX_QUEUE_INSERT_RETRIES - 1) {
          const delay = QUEUE_INSERT_BACKOFF_MS[attempt] || 3000;
          console.warn(`[queue-insert] Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${errorMessage}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.error(`[queue-insert] FAILED after ${MAX_QUEUE_INSERT_RETRIES} attempts for course ${courseId}, step ${step}:`, errorMessage);

        await supabase.from("error_logs").insert({
          course_id: courseId,
          error_type: 'queue_insertion_failed',
          error_message: `Queue insert failed after ${MAX_QUEUE_INSERT_RETRIES} attempts: ${errorMessage}`,
          step: step,
          fix_strategy: 'Investigate queue insertion failure',
          attempt_number: MAX_QUEUE_INSERT_RETRIES
        }).catch((e: Error) => console.warn('[queue-insert] Failed to log error:', e));

        // Emit processing event for visibility
        await emitProcessingEvent(supabase, 'queue_insertion_failed', 'course', courseId, {
          step,
          error: errorMessage,
          attempts: MAX_QUEUE_INSERT_RETRIES,
          metadata
        }).catch((e: Error) => console.warn('[queue-insert] Failed to emit event:', e));

        return { success: false, error: errorMessage };
      }

      console.log(`[queue-insert] SUCCESS: course ${courseId}, step ${step}, job ${data?.id}`);
      return { success: true, jobId: data?.id };

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';

      // Retry on transient exceptions
      if (attempt < MAX_QUEUE_INSERT_RETRIES - 1) {
        const delay = QUEUE_INSERT_BACKOFF_MS[attempt] || 3000;
        console.warn(`[queue-insert] Exception on attempt ${attempt + 1}, retrying in ${delay}ms: ${errorMessage}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error(`[queue-insert] EXCEPTION after ${MAX_QUEUE_INSERT_RETRIES} attempts for course ${courseId}, step ${step}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

// ============ LEASE/LOCK PATTERN ============

// Acquire exclusive lease on a module (prevents duplicate processing)
async function acquireModuleLease(supabase: any, moduleId: string, courseId: string, workerId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('acquire_module_lease', {
      p_module_id: moduleId,
      p_course_id: courseId,
      p_worker_id: workerId,
      p_lease_duration_seconds: LEASE_DURATION_SECONDS
    });
    if (error) {
      console.warn('[lease] Failed to acquire:', error);
      return false;
    }
    console.log(`[lease] Acquired lease for module ${moduleId}: ${data}`);
    return data === true;
  } catch {
    return false;
  }
}

// Renew lease (extend expiry while processing)
async function renewModuleLease(supabase: any, moduleId: string, workerId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('renew_module_lease', {
      p_module_id: moduleId,
      p_worker_id: workerId,
      p_lease_duration_seconds: LEASE_DURATION_SECONDS
    });
    if (error) {
      console.warn('[lease] Failed to renew:', error);
      return false;
    }
    return data === true;
  } catch {
    return false;
  }
}

// Release lease when done
async function releaseModuleLease(supabase: any, moduleId: string, workerId: string): Promise<void> {
  try {
    await supabase.rpc('release_module_lease', {
      p_module_id: moduleId,
      p_worker_id: workerId
    });
    console.log(`[lease] Released lease for module ${moduleId}`);
  } catch (e) {
    console.warn('[lease] Failed to release:', e);
  }
}

// ============ EVENT OUTBOX PATTERN ============

// Emit event to outbox for reliable processing
async function emitProcessingEvent(
  supabase: any,
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, any> = {}
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('emit_processing_event', {
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_payload: payload
    });
    if (error) {
      console.warn('[outbox] Failed to emit event:', error);
      return null;
    }
    console.log(`[outbox] Emitted ${eventType} for ${entityType}:${entityId}`);
    return data;
  } catch {
    return null;
  }
}

// Mark event as processed
async function markEventProcessed(supabase: any, eventId: string): Promise<void> {
  try {
    await supabase.rpc('mark_event_processed', { p_event_id: eventId });
  } catch (e) {
    console.warn('[outbox] Failed to mark processed:', e);
  }
}

// Process pending events from outbox
async function processOutboxEvents(supabase: any): Promise<void> {
  try {
    const { data: events, error } = await supabase.rpc('get_pending_events', { p_limit: 50 });
    if (error || !events?.length) return;

    for (const event of events) {
      try {
        switch (event.event_type) {
          case 'module_completed':
            await handleModuleCompletedEvent(supabase, event);
            break;
          case 'course_completed':
            await handleCourseCompletedEvent(supabase, event);
            break;
          case 'processing_failed':
            await handleProcessingFailedEvent(supabase, event);
            break;
        }
        await markEventProcessed(supabase, event.id);
      } catch (e) {
        console.error(`[outbox] Failed to process event ${event.id}:`, e);
        // Don't mark as processed - will be retried
      }
    }
  } catch (e) {
    console.error('[outbox] Failed to process events:', e);
  }
}

// Handle module_completed event (send email if not in merged mode)
async function handleModuleCompletedEvent(supabase: any, event: any): Promise<void> {
  const { moduleId, email, courseTitle, moduleNumber, totalModules, courseId } = event.payload;

  // Check if course is in merged mode - skip per-module emails
  try {
    const { data: course } = await supabase
      .from("courses")
      .select("merged_course_mode, send_per_module_emails")
      .eq("id", courseId)
      .single();

    if (course?.merged_course_mode === true || course?.send_per_module_emails === false) {
      console.log(`[handleModuleCompletedEvent] Course ${courseId} is in merged mode, skipping per-module email for module ${moduleNumber}`);
      return;
    }
  } catch (e) {
    console.warn(`[handleModuleCompletedEvent] Could not check merged mode for course ${courseId}:`, e);
  }

  await sendModuleCompleteEmailIdempotent(supabase, moduleId, email, courseTitle, moduleNumber, totalModules, courseId);
}

// Handle course_completed event (send completion email + API callback)
// Note: sendCompletionEmail fetches team info from DB itself, so we just pass the basics
async function handleCourseCompletedEvent(supabase: any, event: any): Promise<void> {
  const { email, courseTitle, courseId } = event.payload;

  // Check if this course has an API job with a callback URL
  try {
    const { data: apiJob } = await supabase
      .from('api_jobs')
      .select('id, callback_url')
      .eq('course_id', courseId)
      .single();

    if (apiJob?.callback_url) {
      console.log(`[api-callback] Triggering webhook for course ${courseId} -> ${apiJob.callback_url}`);
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      await fetch(`${supabaseUrl}/functions/v1/api-callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({ courseId, status: 'completed' })
      }).catch(e => console.warn('[api-callback] Failed to trigger webhook:', e));
    }
  } catch (e) {
    console.warn('[api-callback] Error checking for API job:', e);
  }

  await sendCompletionEmail(supabase, email, courseTitle, courseId);
}

// Handle processing_failed event (send failure email + API callback)
async function handleProcessingFailedEvent(supabase: any, event: any): Promise<void> {
  const { email, courseTitle, courseId, errorMessage, errorAnalysis } = event.payload;

  // Check if this course has an API job with a callback URL
  try {
    const { data: apiJob } = await supabase
      .from('api_jobs')
      .select('id, callback_url')
      .eq('course_id', courseId)
      .single();

    if (apiJob?.callback_url) {
      console.log(`[api-callback] Triggering failure webhook for course ${courseId} -> ${apiJob.callback_url}`);
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      await fetch(`${supabaseUrl}/functions/v1/api-callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({ courseId, status: 'failed' })
      }).catch(e => console.warn('[api-callback] Failed to trigger failure webhook:', e));
    }
  } catch (e) {
    console.warn('[api-callback] Error checking for API job:', e);
  }

  await sendFailureEmail(email, courseTitle, courseId, errorMessage, errorAnalysis);
}

// Check if module email was already sent (idempotent)
async function shouldSendModuleEmail(supabase: any, moduleId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('mark_module_email_sent', { p_module_id: moduleId });
    if (error) {
      console.warn('[email] Failed to check/mark email:', error);
      return false; // Don't send on error (safe side)
    }
    return data === true;
  } catch {
    return false;
  }
}

// ============ PROGRESS STEP TRACKING ============

// Progress step types for UI display
type ProgressStep = 'uploading' | 'queued' | 'extracting_frames' | 'transcribing' | 'analyzing' | 'generating_artifact' | 'finalizing' | 'completed' | 'failed';

// Update progress step for a course or module
async function updateProgressStep(
  supabase: any,
  entityType: 'courses' | 'course_modules',
  entityId: string,
  progressStep: ProgressStep,
  additionalUpdates?: Record<string, any>
): Promise<void> {
  try {
    await supabase.from(entityType).update({
      progress_step: progressStep,
      ...additionalUpdates,
    }).eq("id", entityId);
    console.log(`[progress_step] Updated ${entityType} ${entityId} to ${progressStep}`);
  } catch (e) {
    console.warn(`[progress_step] Failed to update ${entityType} ${entityId}:`, e);
  }
}

// ============ DETERMINISTIC ARTIFACT PATHS ============

// Generate deterministic storage path for frames
function getFrameStoragePath(courseId: string, fps: number, timestamp: number, format: string = 'webp'): string {
  return `${courseId}/frames/${fps}fps/${timestamp}.${format}`;
}

// Generate deterministic storage path for PDF
function getPdfStoragePath(courseId: string, moduleNumber?: number): string {
  if (moduleNumber !== undefined) {
    return `${courseId}/module_${moduleNumber}/oneduo.pdf`;
  }
  return `${courseId}/oneduo.pdf`;
}

// Generate deterministic storage path for GIFs
function getGifStoragePath(courseId: string, segmentNumber: number, moduleNumber?: number): string {
  if (moduleNumber !== undefined) {
    return `${courseId}/module_${moduleNumber}/gifs/segment_${segmentNumber}.gif`;
  }
  return `${courseId}/gifs/segment_${segmentNumber}.gif`;
}

// Create a heartbeat interval that keeps updating while job runs
// Also renews lease and refreshes processing_queue.started_at to prevent watchdog kills
function createHeartbeatInterval(
  supabase: any,
  courseId: string,
  moduleId?: string,
  workerId?: string,
  queueJobId?: string
): number {
  console.log(`[heartbeat] Starting background heartbeat for course ${courseId}, queueJobId ${queueJobId}`);

  return setInterval(async () => {
    try {
      // CRITICAL: Update processing_queue.started_at to prevent watchdog from killing us
      // This is what the watchdog actually checks for stuck detection
      if (queueJobId) {
        await supabase.from("processing_queue")
          .update({ started_at: new Date().toISOString() })
          .eq("id", queueJobId)
          .eq("status", "processing");
        console.log(`[heartbeat] Refreshed processing_queue.started_at for job ${queueJobId}`);
      } else {
        // Fallback: update by course_id for all processing jobs (less precise but still works)
        await supabase.from("processing_queue")
          .update({ started_at: new Date().toISOString() })
          .eq("course_id", courseId)
          .eq("status", "processing");
        console.log(`[heartbeat] Refreshed processing_queue.started_at for course ${courseId}`);
      }

      // Also update course/module heartbeats for other monitoring
      await updateCourseHeartbeat(supabase, courseId);
      if (moduleId) {
        await updateModuleHeartbeat(supabase, moduleId);
        // Renew lease if we have a worker ID
        if (workerId) {
          await renewModuleLease(supabase, moduleId, workerId);
        }
      }

      // Log heartbeat event for forensics
      const logJobId = moduleId ? `module-${moduleId.slice(0, 8)}` : getJobIdForCourse(courseId);
      await logJobEvent(supabase, logJobId, {
        step: 'queue_heartbeat',
        level: 'info',
        message: 'Background heartbeat: refreshed processing_queue.started_at',
        metadata: {
          queue_job_id: queueJobId,
          course_id: courseId,
          module_id: moduleId || null,
        }
      }).catch(() => { }); // Don't fail on log errors
    } catch (e) {
      console.warn(`[heartbeat] Failed to update heartbeat:`, e);
    }
  }, HEARTBEAT_INTERVAL_MS) as unknown as number;
}

// ============ ERROR CLASSIFICATION ============
interface ErrorAnalysis {
  type: 'network' | 'rate_limit' | 'format' | 'api_quota' | 'google_drive' | 'transcription' | 'unknown';
  canAutoFix: boolean;
  fixStrategy: string;
  retryDelay: number;
}

function classifyError(errorMessage: string): ErrorAnalysis {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return { type: 'rate_limit', canAutoFix: true, fixStrategy: 'wait_and_retry', retryDelay: 60000 };
  }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('503') || msg.includes('504')) {
    return { type: 'network', canAutoFix: true, fixStrategy: 'extend_timeout', retryDelay: 5000 };
  }
  if (msg.includes('google') || msg.includes('drive') || msg.includes('403')) {
    return { type: 'google_drive', canAutoFix: false, fixStrategy: 'user_action_required', retryDelay: 0 };
  }
  if (msg.includes('format') || msg.includes('codec') || msg.includes('unsupported')) {
    return { type: 'format', canAutoFix: false, fixStrategy: 'user_action_required', retryDelay: 0 };
  }
  // FRAMES-ONLY FALLBACK: Transcription failures can use skip_transcription strategy
  if (msg.includes('transcri') || msg.includes('audio') || msg.includes('assemblyai')) {
    return { type: 'transcription', canAutoFix: true, fixStrategy: 'skip_transcription', retryDelay: 1000 };
  }
  if (msg.includes('quota') || msg.includes('402') || msg.includes('credits')) {
    return { type: 'api_quota', canAutoFix: false, fixStrategy: 'user_action_required', retryDelay: 0 };
  }
  // Job stuck/timeout errors should try frames-only recovery
  if (msg.includes('stuck') || msg.includes('exceeded max retry') || msg.includes('max retry')) {
    return { type: 'transcription', canAutoFix: true, fixStrategy: 'skip_transcription', retryDelay: 1000 };
  }
  return { type: 'unknown', canAutoFix: true, fixStrategy: 'standard_retry', retryDelay: 5000 };
}

// ============ URL VALIDATION FOR LOOM, VIMEO & ZOOM ============
const isValidLoomUrl = (url: string): boolean => {
  return url.includes('loom.com/share/');
};

const isValidVimeoUrl = (url: string): boolean => {
  return url.includes('vimeo.com/') || url.includes('player.vimeo.com/');
};

const isValidZoomUrl = (url: string): boolean => {
  return url.includes('zoom.us/rec/') || url.includes('zoom.us/recording/');
};

// Check if URL is from our own Supabase storage
const isSupabaseStorageUrl = (url: string): boolean => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl) return false;
  const trimmed = url.trim().toLowerCase();
  const storagePattern = supabaseUrl.toLowerCase().replace('https://', '');
  return trimmed.includes(storagePattern) && trimmed.includes('/storage/');
};

// Check if URL is from our own Supabase edge functions (e.g., streaming proxy)
const isSupabaseEdgeFunctionUrl = (url: string): boolean => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl) return false;
  const trimmed = url.trim().toLowerCase();
  const functionPattern = supabaseUrl.toLowerCase().replace('https://', '');
  return trimmed.includes(functionPattern) && trimmed.includes('/functions/');
};

// Validate that a URL is from an allowed video provider (SSRF protection)
const isAllowedVideoUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    console.log(`[isAllowedVideoUrl] Invalid URL: ${url}`);
    return false;
  }
  const trimmed = url.trim().toLowerCase();

  // Block internal/private network URLs
  const blockedPatterns = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/10\./,
    /^https?:\/\/192\.168\./,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^https?:\/\/169\.254\./,  // AWS metadata
    /^https?:\/\/metadata\./,   // Cloud metadata endpoints
    /^file:/,
    /^ftp:/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(trimmed)) {
      console.error(`[SSRF] Blocked suspicious URL pattern: ${url}`);
      return false;
    }
  }

  // Allow our own Supabase storage URLs (for uploaded videos)
  if (isSupabaseStorageUrl(url)) {
    console.log(`[isAllowedVideoUrl] Allowed Supabase storage URL: ${url.substring(0, 80)}...`);
    return true;
  }

  // Allow our own Supabase edge function URLs (for streaming proxy)
  if (isSupabaseEdgeFunctionUrl(url)) {
    console.log(`[isAllowedVideoUrl] Allowed Supabase edge function URL: ${url.substring(0, 80)}...`);
    return true;
  }

  // Allow known video platforms
  const isAllowed = isValidLoomUrl(url) || isValidVimeoUrl(url) || isValidZoomUrl(url);
  console.log(`[isAllowedVideoUrl] URL check result: ${isAllowed} for ${url.substring(0, 80)}...`);
  return isAllowed;
};

const getDirectVideoUrl = (inputUrl: string): string => {
  const trimmed = inputUrl.trim();

  // Loom - already direct
  if (trimmed.includes('loom.com/share/')) {
    return trimmed;
  }

  // Vimeo - handle both formats
  if (trimmed.includes('vimeo.com/')) {
    // Extract video ID and return player embed URL for better compatibility
    const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (match) {
      return `https://player.vimeo.com/video/${match[1]}`;
    }
  }

  // Zoom - cloud recordings share links
  if (trimmed.includes('zoom.us/rec/')) {
    return trimmed;
  }

  return trimmed;
};

type StorageObjectRef = { bucket: string; objectPath: string };

const parseSupabaseStorageObjectUrl = (inputUrl: string): StorageObjectRef | null => {
  try {
    const u = new URL(inputUrl);
    const parts = u.pathname.split('/').filter(Boolean);

    // Expected shapes:
    // /storage/v1/object/public/<bucket>/<path...>
    // /storage/v1/object/sign/<bucket>/<path...>
    const objectIdx = parts.indexOf('object');
    if (objectIdx === -1) return null;

    const bucket = parts[objectIdx + 2];
    const objectPath = parts.slice(objectIdx + 3).join('/');
    if (!bucket || !objectPath) return null;

    return { bucket, objectPath };
  } catch {
    return null;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Check if this is a chunked upload by looking for a manifest file
 * Returns manifest data if found, null otherwise
 */
async function detectChunkedUpload(supabase: any, videoUrl: string): Promise<{
  isChunked: boolean;
  isLargeFile?: boolean;
  manifest?: {
    chunkCount: number;
    totalSize: number;
    chunks: { path: string; size: number; order: number }[];
  };
  manifestPath?: string;
  totalSizeBytes?: number;
} | null> {
  try {
    // Extract path from video URL
    const ref = parseSupabaseStorageObjectUrl(videoUrl);
    if (!ref) return null;

    // Check for manifest file (video.mp4.manifest.json)
    // The video URL might point to chunk_0000, so we need to find the base path
    let basePath = ref.objectPath;

    // If it ends with _chunk_XXXX, strip that to get base path
    const chunkMatch = basePath.match(/^(.+?)_chunk_\d+$/);
    if (chunkMatch) {
      basePath = chunkMatch[1];
    }

    const manifestPath = `${basePath}.manifest.json`;
    console.log(`[detectChunkedUpload] Checking for manifest at: ${manifestPath}`);

    // Try to download manifest
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .download(manifestPath);

    if (error || !data) {
      console.log(`[detectChunkedUpload] No manifest found. Checking file size of ${ref.objectPath}...`);

      // Fallback: Check size of the single object
      // We use list approach to get metadata without downloading
      const parts = ref.objectPath.split('/');
      const fileName = parts.pop();
      const folder = parts.join('/');

      const { data: objects, error: listError } = await supabase.storage
        .from(ref.bucket)
        .list(folder, { search: fileName });

      if (listError || !objects || objects.length === 0) {
        console.warn(`[detectChunkedUpload] Could not get metadata for ${ref.objectPath}`);
        return { isChunked: false };
      }

      const totalSizeBytes = objects[0].metadata?.size || 0;
      const totalGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
      const isLargeFile = totalSizeBytes > 1024 * 1024 * 1024; // > 1GB

      console.log(`[detectChunkedUpload] Single file detected: ${totalGB} GB, isLargeFile=${isLargeFile}`);

      return {
        isChunked: false,
        isLargeFile,
        totalSizeBytes
      };
    }

    // Parse manifest
    const manifestText = await data.text();
    const manifest = JSON.parse(manifestText);

    console.log(`[detectChunkedUpload] Found chunked upload: ${manifest.chunkCount} chunks, ${(manifest.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);

    return {
      isChunked: true,
      isLargeFile: true, // All chunked uploads are large files
      manifest: {
        chunkCount: manifest.chunkCount,
        totalSize: manifest.totalSize,
        chunks: manifest.chunks,
      },
      manifestPath,
      totalSizeBytes: manifest.totalSize
    };
  } catch (e) {
    console.log(`[detectChunkedUpload] Error checking manifest/size:`, e);
    return { isChunked: false };
  }
}

/**
 * Process a chunked video upload by creating video_chunks records and triggering parallel processing
 * This handles 4+ hour videos that were uploaded in 500MB chunks
 */
async function processChunkedVideo(
  supabase: any,
  courseId: string,
  course: any,
  chunkedInfo: {
    isChunked: boolean;
    isLargeFile?: boolean;
    manifest?: {
      chunkCount: number;
      totalSize: number;
      chunks: { path: string; size: number; order: number }[];
    };
    manifestPath?: string;
    totalSizeBytes?: number;
  }
): Promise<void> {
  const jobId = `chunked-${courseId.slice(0, 8)}`;
  const totalSizeBytes = chunkedInfo.manifest?.totalSize || chunkedInfo.totalSizeBytes || 0;
  const totalGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
  const uploadChunkCount = chunkedInfo.manifest?.chunkCount || 1;

  await logJobEvent(supabase, jobId, {
    step: 'chunked_processing_start',
    level: 'info',
    message: `Starting chunked video processing: ${uploadChunkCount} upload chunks, ${totalGB} GB`,
    metadata: { courseId, chunkCount: uploadChunkCount, totalGB }
  });

  // Update course status
  await supabase.from("courses").update({
    status: "processing",
    progress: 8, // Start slightly higher to show immediate movement
    progress_step: "chunking_video",
    chunked: true,
    chunk_count: 0, // Will be updated after we create processing chunks
  }).eq("id", courseId);

  // Calculate video duration estimate from file size (generous for screen recordings: ~1MB per minute)
  const estimatedDurationSeconds = Math.ceil(totalSizeBytes / (1 * 1024 * 1024) * 60);

  // Define processing chunk duration (10 minutes per processing chunk)
  const PROCESSING_CHUNK_DURATION = 10 * 60; // 10 minutes in seconds
  const processingChunkCount = Math.ceil(estimatedDurationSeconds / PROCESSING_CHUNK_DURATION);

  console.log(`[processChunkedVideo] Estimated duration: ${estimatedDurationSeconds}s, creating ${processingChunkCount} processing chunks`);

  // Create video_chunks records for each 10-minute segment
  const chunkRecords: any[] = [];
  for (let i = 0; i < processingChunkCount; i++) {
    const startSeconds = i * PROCESSING_CHUNK_DURATION;
    const endSeconds = Math.min((i + 1) * PROCESSING_CHUNK_DURATION, estimatedDurationSeconds);

    chunkRecords.push({
      course_id: courseId,
      module_id: null,
      chunk_index: i,
      total_chunks: processingChunkCount,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      status: 'pending',
      attempt_count: 0,
      // Store manifest info so chunk processor knows this is a manifest-based upload
      metadata: {
        manifestPath: chunkedInfo.manifestPath,
        uploadChunkCount: uploadChunkCount,
        isManifestBased: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Insert all chunk records
  const { error: insertError } = await supabase
    .from('video_chunks')
    .insert(chunkRecords);

  if (insertError) {
    // Check if chunks already exist (idempotent)
    if (insertError.code === '23505') {
      console.log(`[processChunkedVideo] Chunks already exist for course ${courseId}`);
    } else {
      console.error(`[processChunkedVideo] Failed to insert chunks:`, insertError);
      throw new Error(`Failed to create chunk records: ${insertError.message}`);
    }
  }

  // Update course with chunk info
  await supabase.from("courses").update({
    chunk_count: processingChunkCount,
    completed_chunks: 0,
    chunking_strategy: 'manifest-parallel-10',
    video_duration_seconds: estimatedDurationSeconds,
  }).eq("id", courseId);

  await logJobEvent(supabase, jobId, {
    step: 'chunks_created',
    level: 'info',
    message: `Created ${processingChunkCount} processing chunks`,
    metadata: { courseId, processingChunkCount, estimatedDurationSeconds }
  });

  // Mark current processing queue job as awaiting webhook
  await supabase.from("processing_queue")
    .update({
      status: "awaiting_webhook",
      metadata: { chunkedProcessing: true, chunkCount: processingChunkCount }
    })
    .eq("course_id", courseId)
    .eq("step", "transcribe_and_extract")
    .eq("status", "processing");

  // Trigger parallel chunk processing (up to 5 at a time)
  const MAX_PARALLEL_CHUNKS = 5;
  const chunksToStart = Math.min(MAX_PARALLEL_CHUNKS, processingChunkCount);

  console.log(`[processChunkedVideo] Triggering ${chunksToStart} parallel chunk processors`);

  // Invoke process-chunk function for each initial batch
  const chunkPromises: Promise<any>[] = [];
  for (let i = 0; i < chunksToStart; i++) {
    chunkPromises.push(
      supabase.functions.invoke('process-chunk', {
        body: { courseId, maxChunks: 1 }
      }).catch((e: Error) => {
        console.warn(`[processChunkedVideo] Failed to trigger chunk processor ${i}:`, e);
      })
    );
  }

  // Wait for all initial triggers (they return immediately after claiming chunks)
  await Promise.all(chunkPromises);

  await logJobEvent(supabase, jobId, {
    step: 'chunk_processors_triggered',
    level: 'info',
    message: `Triggered ${chunksToStart} parallel chunk processors`,
    metadata: { courseId, chunksToStart, totalChunks: processingChunkCount }
  });

  console.log(`[processChunkedVideo] Chunked processing initiated for course ${courseId}`);
}

/**
 * External services like Replicate/AssemblyAI need a directly fetchable URL.
 * For our storage URLs, we generate a signed URL (works for both public + private buckets)
 * and retry briefly to tolerate storage propagation after upload.
 * 
 * CHUNKED UPLOAD HANDLING:
 * If this is a chunked upload (manifest exists), this function will:
 * 1. Detect the manifest
 * 2. Return a signed URL for the FIRST chunk (for initial processing)
 * 3. Log a warning that full video processing requires stitching
 */
async function resolveVideoUrlForExternalServices(
  supabase: any,
  inputUrl: string,
  opts?: { expiresInSeconds?: number; maxAttempts?: number; verifyAccessible?: boolean; allowChunked?: boolean }
): Promise<string> {
  const direct = getDirectVideoUrl(inputUrl);
  if (!isSupabaseStorageUrl(direct)) return direct;

  const ref = parseSupabaseStorageObjectUrl(direct);
  if (!ref) return direct;

  const expiresInSeconds = opts?.expiresInSeconds ?? 60 * 60;
  const maxAttempts = opts?.maxAttempts ?? 15;
  const verifyAccessible = opts?.verifyAccessible ?? true;
  const allowChunked = opts?.allowChunked ?? false;
  let lastErr = 'unknown';

  // Check for chunked upload FIRST
  const chunkedInfo = await detectChunkedUpload(supabase, direct);
  if (chunkedInfo?.isChunked && !allowChunked) {
    // This is a chunked upload - throw specific error so caller can handle
    const totalGB = (chunkedInfo.manifest!.totalSize / (1024 * 1024 * 1024)).toFixed(2);
    throw new Error(
      `CHUNKED_UPLOAD_DETECTED: This video was uploaded in ${chunkedInfo.manifest!.chunkCount} chunks (${totalGB} GB). ` +
      `Full video processing requires chunk stitching. The processing pipeline will handle this automatically.`
    );
  }

  // Initial delay to allow storage propagation after upload
  await sleep(3000);
  console.log(`[resolveVideoUrl] Starting URL resolution for ${ref.bucket}/${ref.objectPath}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.objectPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      lastErr = error?.message || 'No signed URL returned';
      console.log(`[resolveVideoUrl] Attempt ${attempt}/${maxAttempts}: signed URL failed - ${lastErr}`);
      await sleep(Math.min(1000 * attempt, 5000));
      continue;
    }

    // Verify the URL is actually accessible by doing a HEAD request
    if (verifyAccessible) {
      try {
        const headResponse = await fetch(data.signedUrl, { method: 'HEAD' });
        if (headResponse.ok) {
          console.log(`[resolveVideoUrl] Attempt ${attempt}: URL verified accessible (status ${headResponse.status})`);
          return data.signedUrl;
        } else {
          lastErr = `HEAD request failed with status ${headResponse.status}`;
          console.log(`[resolveVideoUrl] Attempt ${attempt}/${maxAttempts}: ${lastErr}`);
        }
      } catch (fetchError) {
        lastErr = `HEAD request error: ${fetchError instanceof Error ? fetchError.message : 'unknown'}`;
        console.log(`[resolveVideoUrl] Attempt ${attempt}/${maxAttempts}: ${lastErr}`);
      }
    } else {
      return data.signedUrl;
    }

    await sleep(Math.min(2000 + 1000 * attempt, 5000));
  }

  throw new Error(`Video not yet accessible in storage (signed URL failed: ${lastErr})`);
}

function isPermanentMissingFileError(message: string): boolean {
  const m = (message || '').toLowerCase();
  // Only treat truly missing objects as permanent; other errors may be transient.
  return m.includes('object not found') || m.includes('no such key');
}

function normalizeMissingFileMessage(original: string): string {
  if (!isPermanentMissingFileError(original)) return original;
  return 'Upload incomplete: the video file was not found in storage. Please re-upload this video.';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Extract authenticated user ID from JWT token (if present)
  let authenticatedUserId: string | null = null;
  let authenticatedUserEmail: string | null = null;
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // Create a client with the user's token to get their identity
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || supabaseServiceKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user }, error } = await userClient.auth.getUser();
      if (!error && user?.id) {
        authenticatedUserId = user.id;
        authenticatedUserEmail = user.email ?? null;
        console.log(`[process-course] Authenticated user: ${authenticatedUserId}`);
      }
    }
  } catch (authError) {
    console.warn('[process-course] Could not extract user from auth token:', authError);
  }

  try {
    const body = await req.json();
    const { action, courseId } = body;

    console.log(`[process-course] Action: ${action}, Course: ${courseId}`);

    switch (action) {
      // ============ CREATE COURSE (with multi-module support) ============
      case "create-course": {
        const {
          email,
          title,
          videoUrl,
          densityMode = "standard",
          isMultiModule = false,
          modules,
          // New: pre-extracted frames from client-side FFmpeg
          preExtractedFrames,
          videoDuration,
          // Extraction FPS - defaults to 1 for Fast Mode (~3x faster, ~3x cheaper)
          // Use 3 for Precision Mode (forensic-level detail for software demos)
          extractionFps = 1,
          // Team notification for "You're Done" flow
          teamNotificationEmail,
          teamNotificationRole,
          // Course-level supplementary files (PDFs, docs, etc.)
          courseFiles,
          // Unique upload ID to ensure each upload creates a new course
          uploadId,
          // MERGED COURSE MODE: When true, all modules become chapters in ONE PDF
          // User gets ONE email when entire course is complete (with progress updates during processing)
          mergedCourseMode = false,
          // Control per-module emails (false when merged mode is on)
          sendPerModuleEmails = true,
        } = body;

        console.log(`[create-course] NEW COURSE REQUEST - Email: ${email}, Title: ${title}, FPS: ${extractionFps} (${extractionFps === 1 ? 'Fast' : 'Precision'}), UploadId: ${uploadId || 'none'}, MergedMode: ${mergedCourseMode}, VideoUrl: ${videoUrl?.substring(0, 80) || 'multi-module'}...`);

        // Validate extractionFps - only 1 (Fast Mode) or 3 (Precision Mode) are allowed
        // Default to 1 FPS for Fast Mode (~3x faster processing)
        const validatedFps = extractionFps === 3 ? 3 : 1;

        // Check if this is an audio-only upload (no video frames needed)
        const isAudioOnly = body.isAudioOnly || (modules?.length === 1 && modules[0].isAudio) || (!isMultiModule && body.isAudio);

        if (!email || !title || (!videoUrl && !modules?.length)) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // SSRF Protection: Validate video URLs are from allowed providers
        // Skip validation for uploaded files (they come without a videoUrl initially, or from our storage)
        if (videoUrl && !isMultiModule) {
          if (!isAllowedVideoUrl(videoUrl)) {
            console.error(`[SSRF] Rejected invalid video URL: ${videoUrl}`);
            return new Response(JSON.stringify({
              error: "Invalid video URL. Please upload a video file or use Loom, Vimeo, or Zoom URLs."
            }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Validate module URLs for multi-module courses
        if (isMultiModule && modules?.length) {
          for (const mod of modules) {
            // Skip validation if no URL (shouldn't happen) or if it's from our storage
            if (mod.videoUrl && !isAllowedVideoUrl(mod.videoUrl)) {
              console.error(`[SSRF] Rejected invalid module video URL: ${mod.videoUrl}`);
              return new Response(JSON.stringify({
                error: `Invalid video URL in module "${mod.title || mod.moduleNumber}". Please upload a video file or use Loom, Vimeo, or Zoom URLs.`
              }), {
                status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        }

        console.log(`[create-course] Validated URLs. isMultiModule: ${isMultiModule}, modules count: ${modules?.length || 0}`);

        // Check if we have pre-extracted frames (client-side extraction)
        const hasPreExtractedFrames = preExtractedFrames && Array.isArray(preExtractedFrames) && preExtractedFrames.length > 0;

        // Create course record - CRITICAL: Include user_id to enable OneDuo artifact generation
        console.log(`[create-course] Creating course with user_id: ${authenticatedUserId || 'NULL (anonymous)'}`);

        const { data: course, error: courseError } = await supabase
          .from("courses")
          .insert({
            email,
            title,
            video_url: isMultiModule ? null : videoUrl,
            density_mode: densityMode,
            fps_target: validatedFps, // Use validated FPS (1 = standard, 3 = precision/Pro)
            status: hasPreExtractedFrames ? "processing" : "queued",
            is_multi_module: isMultiModule,
            module_count: isMultiModule ? modules.length : 1,
            completed_modules: 0,
            // MERGED COURSE MODE: All videos become chapters in ONE PDF
            merged_course_mode: mergedCourseMode === true,
            send_per_module_emails: sendPerModuleEmails !== false,
            // CRITICAL: Save authenticated user ID for OneDuo artifact pipeline
            // Without this, transformation_artifacts cannot be created
            ...(authenticatedUserId && { user_id: authenticatedUserId }),
            // Team notification for "You're Done" flow
            ...(teamNotificationEmail && { team_notification_email: teamNotificationEmail }),
            ...(teamNotificationRole && { team_notification_role: teamNotificationRole }),
            // Course-level supplementary files
            ...(courseFiles && Array.isArray(courseFiles) && courseFiles.length > 0 && {
              course_files: courseFiles.map((f: any) => ({
                name: f.name,
                storagePath: f.storagePath,
                size: f.size,
                uploadedAt: new Date().toISOString()
              }))
            }),
            // Store pre-extracted frames if available
            ...(hasPreExtractedFrames && {
              frame_urls: preExtractedFrames,
              video_duration_seconds: videoDuration,
              total_frames: preExtractedFrames.length,
              processed_frames: preExtractedFrames.length,
            }),
          })
          .select()
          .single();

        if (courseError) {
          console.error(`[create-course] FAILED to create course: ${courseError.message}`, courseError);
          throw courseError;
        }

        console.log(`[create-course] SUCCESS - Course ID: ${course.id}, FPS: ${validatedFps}, Status: ${course.status}`);

        // Create module records if multi-module
        if (isMultiModule && modules?.length) {
          const moduleRecords = modules.map((m: any) => ({
            course_id: course.id,
            module_number: m.moduleNumber,
            title: m.title || `Module ${m.moduleNumber}`,
            video_url: m.videoUrl,
            status: 'queued',
            // Store module-level supplementary files
            ...(m.moduleFiles && Array.isArray(m.moduleFiles) && m.moduleFiles.length > 0 && {
              module_files: m.moduleFiles.map((f: any) => ({
                name: f.name,
                storagePath: f.storagePath,
                size: f.size,
                uploadedAt: new Date().toISOString()
              }))
            }),
            // Store pre-extracted frames per module if available
            ...(m.frameUrls && {
              frame_urls: m.frameUrls,
              video_duration_seconds: m.durationSeconds,
              total_frames: m.frameUrls.length,
            }),
            // MULTI-VIDEO MODULE SUPPORT: Store source videos if this module has multiple videos
            ...(m.sourceVideos && Array.isArray(m.sourceVideos) && m.sourceVideos.length > 1 && {
              source_videos: m.sourceVideos,
              stitch_status: 'pending',
            }),
          }));

          const { data: insertedModules, error: moduleError } = await supabase
            .from("course_modules")
            .insert(moduleRecords)
            .select('id, module_number');

          if (moduleError) {
            console.error("[create-course] Failed to create modules:", moduleError);
          }

          // PARALLEL PROCESSING: Queue up to 3 modules simultaneously for faster processing
          const MAX_PARALLEL_MODULES = 3;
          const modulesToQueue = Math.min(modules.length, MAX_PARALLEL_MODULES);

          console.log(`[create-course] PARALLEL: Queueing ${modulesToQueue} modules simultaneously for course ${course.id}`);

          for (let i = 0; i < modulesToQueue; i++) {
            const mod = modules[i];
            const hasModuleFrames = mod.frameUrls && mod.frameUrls.length > 0;
            const requiresStitching = mod.requiresStitching || (mod.sourceVideos?.length > 1);

            // Determine the step based on stitching requirement
            let step: string;
            if (requiresStitching) {
              step = "stitch_videos";
            } else if (hasModuleFrames || mod.isAudio) {
              // Audio-only modules skip frame extraction, go straight to transcribe
              step = "transcribe_module";
            } else {
              step = "transcribe_and_extract_module";
            }

            // Get the module ID for stitch step
            const moduleId = insertedModules?.find((im: any) => im.module_number === mod.moduleNumber)?.id;

            const queueResult = await insertQueueEntry(supabase, course.id, step, {
              moduleNumber: mod.moduleNumber,
              hasPreExtractedFrames: hasModuleFrames,
              ...(mod.isAudio && { skipFrameExtraction: true, isAudioOnly: true }),
              ...(requiresStitching && {
                moduleId,
                sourceVideos: mod.sourceVideos,
                requiresStitching: true
              })
            });
            if (!queueResult.success) {
              console.error(`[create-course] CRITICAL: Failed to queue ${step} for module ${mod.moduleNumber}`);
            } else {
              console.log(`[create-course] PARALLEL: Queued module ${mod.moduleNumber} (${step})${requiresStitching ? ' [MULTI-VIDEO]' : ''}`);
              // For audio modules, set progress_step to 'transcribing' so Dashboard shows correct label
              if (mod.isAudio && moduleId) {
                await updateProgressStep(supabase, 'course_modules', moduleId, 'transcribing');
              }
            }
          }
        } else if (hasPreExtractedFrames) {
          // Single video with pre-extracted frames - skip to transcription then GIF rendering
          console.log(`[create-course] Course ${course.id} has ${preExtractedFrames.length} pre-extracted frames`);

          const queueResult = await insertQueueEntry(supabase, course.id, "transcribe", {
            hasPreExtractedFrames: true,
            skipFrameExtraction: true
          });
          if (!queueResult.success) {
            console.error(`[create-course] CRITICAL: Failed to queue transcribe for course ${course.id}`);
          }
        } else {
          // Single video/audio without pre-extracted frames
          if (isAudioOnly) {
            // Audio-only: skip frame extraction, just transcribe
            console.log(`[create-course] Audio-only upload detected for course ${course.id} - skipping frame extraction`);
            const queueResult = await insertQueueEntry(supabase, course.id, "transcribe", {
              skipFrameExtraction: true,
              isAudioOnly: true,
            });
            if (!queueResult.success) {
              console.error(`[create-course] CRITICAL: Failed to queue transcribe for audio-only course ${course.id}`);
            } else {
              // Set progress_step to 'transcribing' so the Dashboard doesn't fall back to 'Extracting frames'
              await updateProgressStep(supabase, 'courses', course.id, 'transcribing');
            }
          } else {
            // Regular video - use PARALLEL processing
            const queueResult = await insertQueueEntry(supabase, course.id, "transcribe_and_extract");
            if (!queueResult.success) {
              console.error(`[create-course] CRITICAL: Failed to queue transcribe_and_extract for course ${course.id}`);
            }
          }
        }

        console.log(`[process-course] Created course ${course.id}${isMultiModule ? ` with ${modules.length} modules` : ''}${hasPreExtractedFrames ? ' (with pre-extracted frames)' : ''}`);

        // IMMEDIATE PROCESSING: Start processing right away, don't wait for cron
        // Use waitUntil if available, otherwise fire-and-forget fetch
        const processPromise = processNextStep(supabase, course.id);
        if ((globalThis as any).EdgeRuntime?.waitUntil) {
          (globalThis as any).EdgeRuntime.waitUntil(processPromise);
        } else {
          // Fallback: don't await, but ensure it runs
          processPromise.catch((e: Error) => console.warn('[create-course] Background poll failed:', e));
        }

        return new Response(JSON.stringify({
          success: true,
          courseId: course.id,
          message: isMultiModule
            ? `Course with ${modules.length} modules queued for processing.`
            : hasPreExtractedFrames
              ? "Course processing started with pre-extracted frames!"
              : "Course queued for processing."
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ============ ADD MODULES TO EXISTING COURSE ============
      case "add-modules": {
        const { email, modules } = body;

        if (!courseId || !email || !modules?.length) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify course exists and belongs to user
        const { data: existingCourse, error: courseError } = await supabase
          .from("courses")
          .select("*")
          .eq("id", courseId)
          .eq("email", email)
          .single();

        if (courseError || !existingCourse) {
          return new Response(JSON.stringify({ error: "Course not found or access denied" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get current module count
        const { data: existingModules } = await supabase
          .from("course_modules")
          .select("module_number")
          .eq("course_id", courseId)
          .order("module_number", { ascending: false })
          .limit(1);

        const lastModuleNumber = existingModules?.[0]?.module_number || 0;

        // Create new module records
        const moduleRecords = modules.map((m: any, idx: number) => ({
          course_id: courseId,
          module_number: lastModuleNumber + idx + 1,
          title: m.title || `Module ${lastModuleNumber + idx + 1}`,
          video_url: m.videoUrl,
          status: 'queued',
          // Store pre-extracted frames per module if available
          ...(m.frameUrls && {
            frame_urls: m.frameUrls,
            video_duration_seconds: m.durationSeconds,
            total_frames: m.frameUrls.length,
          }),
        }));

        const { error: moduleError } = await supabase
          .from("course_modules")
          .insert(moduleRecords);

        if (moduleError) {
          console.error("[add-modules] Failed to create modules:", moduleError);
          throw moduleError;
        }

        // Update course to reflect multi-module and new count
        const newModuleCount = lastModuleNumber + modules.length;
        await supabase.from("courses").update({
          is_multi_module: true,
          module_count: newModuleCount,
          status: existingCourse.status === 'completed' ? 'processing' : existingCourse.status,
        }).eq("id", courseId);

        // PARALLEL PROCESSING: Queue up to 3 new modules simultaneously
        const MAX_PARALLEL_MODULES = 3;
        const modulesToQueue = Math.min(modules.length, MAX_PARALLEL_MODULES);

        console.log(`[add-modules] PARALLEL: Queueing ${modulesToQueue} modules for course ${courseId}`);

        for (let i = 0; i < modulesToQueue; i++) {
          const mod = modules[i];
          const modNumber = lastModuleNumber + i + 1;
          const hasModuleFrames = mod.frameUrls && mod.frameUrls.length > 0;
          const step = hasModuleFrames ? "transcribe_module" : "transcribe_and_extract_module";

          const queueResult = await insertQueueEntry(supabase, courseId, step, {
            moduleNumber: modNumber,
            hasPreExtractedFrames: hasModuleFrames
          });
          if (!queueResult.success) {
            console.error(`[add-modules] CRITICAL: Failed to queue ${step} for module ${modNumber}`);
          } else {
            console.log(`[add-modules] PARALLEL: Queued module ${modNumber}`);
          }
        }

        console.log(`[add-modules] Added ${modules.length} modules to course ${courseId}`);
        (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));

        return new Response(JSON.stringify({
          success: true,
          courseId,
          message: `Added ${modules.length} module(s) to course.`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ============ GET STATUS ============
      case "get-status": {
        const { data: course, error } = await supabase
          .from("courses")
          .select("id, title, status, progress, error_message, created_at, completed_at, is_multi_module, module_count, completed_modules")
          .eq("id", courseId)
          .single();

        if (error) throw error;

        // If multi-module, also fetch module statuses
        let moduleStatuses = null;
        if (course.is_multi_module) {
          const { data: mods } = await supabase
            .from("course_modules")
            .select("id, module_number, title, status, progress, error_message")
            .eq("course_id", courseId)
            .order("module_number");
          moduleStatuses = mods;
        }

        return new Response(JSON.stringify({ ...course, modules: moduleStatuses }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ GET DASHBOARD ============
      case "get-dashboard": {
        const { email } = body;

        // GOVERNANCE: Filter out purged records (soft-deleted via execution_frames)
        const { data: courses, error } = await supabase
          .from("courses")
          .select("id, title, status, progress, progress_step, error_message, created_at, completed_at, density_mode, fps_target, is_multi_module, module_count, completed_modules, fix_attempts, last_fix_strategy, video_duration_seconds, share_enabled, share_token, last_heartbeat_at, pdf_revision_pending, course_files, project_id")
          .eq("email", email)
          .eq("purged", false)
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Fetch ALL modules for all courses (not just multi-module ones)
        // GOVERNANCE: Filter out purged modules
        const courseIds = courses?.map((c: any) => c.id) || [];
        let moduleMap: Record<string, any[]> = {};

        if (courseIds.length > 0) {
          const { data: modules } = await supabase
            .from("course_modules")
            .select("id, course_id, module_number, title, status, progress, progress_step, error_message, created_at, video_duration_seconds, heartbeat_at")
            .in("course_id", courseIds)
            .eq("purged", false)
            .order("module_number");

          if (modules) {
            for (const mod of modules) {
              if (!moduleMap[mod.course_id]) moduleMap[mod.course_id] = [];
              moduleMap[mod.course_id].push(mod);
            }
          }
        }

        const enrichedCourses = courses?.map((c: any) => ({
          ...c,
          modules: moduleMap[c.id] || []
        }));

        // LAZY PROGRESS UPDATE: Check Replicate status for active extractions
        // This ensures "real-time" progress without keeping background functions alive
        try {
          const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
          if (REPLICATE_API_KEY && enrichedCourses) {
            const updates = [];
            
            for (const course of enrichedCourses) {
              // Check course-level extraction
              if (course.status === 'processing' && 
                  course.progress_step === 'extracting_frames' && 
                  course.prediction_id && 
                  // Only check if heartbeat is older than 10s or missing
                  (!course.last_heartbeat_at || (Date.now() - new Date(course.last_heartbeat_at).getTime() > 10000))) {
                
                updates.push(checkReplicateProgress(supabase, course.id, 'courses', course.prediction_id, REPLICATE_API_KEY, course));
              }

              // Check module-level extractions
              for (const mod of course.modules) {
                if (mod.status === 'processing' && 
                    mod.progress_step === 'extracting_frames_module' && // Note: step name might differ for modules
                    mod.prediction_id &&
                    (!mod.heartbeat_at || (Date.now() - new Date(mod.heartbeat_at).getTime() > 10000))) {
                   
                   updates.push(checkReplicateProgress(supabase, mod.id, 'course_modules', mod.prediction_id, REPLICATE_API_KEY, mod));
                }
              }
            }

            if (updates.length > 0) {
              // Wait for updates but don't block too long (max 2s)
              const results = await Promise.race([
                Promise.all(updates),
                new Promise(resolve => setTimeout(() => resolve([]), 2000))
              ]) as any[];

              // Merge updates back into response (in-memory only, DB is updated by helpers)
              if (Array.isArray(results)) {
                results.forEach(u => {
                  if (!u) return;
                  // Update course in list
                  if (u.table === 'courses') {
                    const c = enrichedCourses.find((x: any) => x.id === u.id);
                    if (c) {
                      c.progress = u.progress;
                      c.last_heartbeat_at = new Date().toISOString();
                    }
                  } 
                  // Update module in list
                  else if (u.table === 'course_modules') {
                    for (const c of enrichedCourses) {
                      const m = c.modules?.find((x: any) => x.id === u.id);
                      if (m) {
                        m.progress = u.progress;
                        m.heartbeat_at = new Date().toISOString();
                      }
                    }
                  }
                });
              }
            }
          }
        } catch (e) {
          console.warn('[get-dashboard] Lazy progress check failed:', e);
          // Continue returning stale data rather than failing
        }

        return new Response(JSON.stringify({ courses: enrichedCourses }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ RENAME TRAINING (BYPASS RLS, OWNER-VERIFIED) ============
      // Renames all courses in a training block. Uses service key, but requires the caller's JWT email to match.
      case "rename-training": {
        const { courseIds, newTitle } = body;
        console.log(`[rename-training] Request: courseIds=${JSON.stringify(courseIds)}, newTitle=${newTitle}, authEmail=${authenticatedUserEmail}`);

        if (!authenticatedUserId || !authenticatedUserEmail) {
          console.log('[rename-training] ERROR: Not authenticated');
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!Array.isArray(courseIds) || courseIds.length === 0) {
          console.log('[rename-training] ERROR: Missing courseIds');
          return new Response(JSON.stringify({ error: "Missing courseIds" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const nextTitle = String(newTitle || '').trim();
        if (!nextTitle) {
          console.log('[rename-training] ERROR: Missing newTitle');
          return new Response(JSON.stringify({ error: "Missing newTitle" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Use authenticated email from JWT (more reliable than request body)
        const ownerEmail = authenticatedUserEmail;

        // Verify ownership by email and purged=false
        const { data: ownedCourses, error: ownedError } = await supabase
          .from("courses")
          .select("id")
          .in("id", courseIds)
          .eq("email", ownerEmail)
          .eq("purged", false);

        if (ownedError) {
          console.log('[rename-training] ERROR: DB error verifying ownership:', ownedError);
          throw ownedError;
        }
        if (!ownedCourses || ownedCourses.length !== courseIds.length) {
          console.log(`[rename-training] ERROR: Ownership mismatch. Requested ${courseIds.length}, found ${ownedCourses?.length || 0} for email ${ownerEmail}`);
          return new Response(JSON.stringify({ error: "Course not found or access denied" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: updateError } = await supabase
          .from("courses")
          .update({ title: nextTitle })
          .in("id", courseIds)
          .eq("email", ownerEmail);

        if (updateError) {
          console.log('[rename-training] ERROR: Update failed:', updateError);
          throw updateError;
        }

        console.log(`[rename-training] SUCCESS: Renamed ${courseIds.length} courses to "${nextTitle}"`);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ MOVE TO FOLDER (BYPASS RLS, OWNER-VERIFIED) ============
      // Moves courses to a folder (project). Uses service key, but requires the caller's JWT email to match.
      case "move-to-folder": {
        const { email, courseIds, folderId } = body;

        if (!authenticatedUserId || !authenticatedUserEmail) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!email || typeof email !== 'string' || authenticatedUserEmail !== email) {
          return new Response(JSON.stringify({ error: "Access denied" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!Array.isArray(courseIds) || courseIds.length === 0) {
          return new Response(JSON.stringify({ error: "Missing courseIds" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // folderId can be null (to remove from folder) or a valid UUID
        const targetFolderId = folderId === null ? null : String(folderId);

        // If folderId is provided (not null), verify the folder belongs to the user
        if (targetFolderId !== null) {
          const { data: folder, error: folderError } = await supabase
            .from("projects")
            .select("id, user_id")
            .eq("id", targetFolderId)
            .single();

          if (folderError || !folder) {
            return new Response(JSON.stringify({ error: "Folder not found" }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (folder.user_id !== authenticatedUserId) {
            return new Response(JSON.stringify({ error: "Folder access denied" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Verify ownership of all courses by email and purged=false
        const { data: ownedCourses, error: ownedError } = await supabase
          .from("courses")
          .select("id")
          .in("id", courseIds)
          .eq("email", email)
          .eq("purged", false);

        if (ownedError) throw ownedError;
        if (!ownedCourses || ownedCourses.length !== courseIds.length) {
          return new Response(JSON.stringify({ error: "Course not found or access denied" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: updateError } = await supabase
          .from("courses")
          .update({ project_id: targetFolderId })
          .in("id", courseIds)
          .eq("email", email);

        if (updateError) throw updateError;

        console.log(`[move-to-folder] Moved ${courseIds.length} courses to folder ${targetFolderId || 'uncategorized'} for ${email}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ SMART RETRY WITH SELF-HEALING ============
      case "retry": {
        const { fixStrategy } = body;

        const { data: course, error: fetchError } = await supabase
          .from("courses")
          .select("*")
          .eq("id", courseId)
          .single();

        if (fetchError) throw fetchError;
        if (course.status !== "failed") {
          return new Response(JSON.stringify({ error: "Course is not in failed state" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Analyze the error and determine fix strategy
        const errorAnalysis = classifyError(course.error_message || '');
        const fixAttempts = (course.fix_attempts || 0) + 1;

        // Log the retry attempt
        await supabase.from("error_logs").insert({
          course_id: courseId,
          error_type: errorAnalysis.type,
          error_message: course.error_message || 'Unknown error',
          step: 'retry',
          fix_strategy: errorAnalysis.fixStrategy,
          fix_attempted: true,
          attempt_number: fixAttempts
        });

        // Get the failed step to restart from (use maybeSingle to avoid error when no job exists)
        const { data: lastJob } = await supabase
          .from("processing_queue")
          .select("*")
          .eq("course_id", courseId)
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let restartStep = lastJob?.step || "transcribe";

        // Apply self-healing modifications based on error type
        const metadata: Record<string, any> = {
          fixStrategy: errorAnalysis.fixStrategy,
          fixAttempt: fixAttempts
        };

        if (errorAnalysis.type === 'transcription' && fixAttempts >= 2) {
          // Skip transcription on second failure
          metadata.skipTranscription = true;
          restartStep = "extract_frames";
          console.log(`[retry] Skipping transcription after ${fixAttempts} failures`);
        }

        if (errorAnalysis.type === 'rate_limit') {
          metadata.extendedDelay = true;
          metadata.delayMultiplier = fixAttempts;
        }

        if (errorAnalysis.type === 'network') {
          metadata.extendedTimeout = true;
          metadata.timeoutMultiplier = 1 + (fixAttempts * 0.5);
        }

        // Reset course and queue retry
        await supabase.from("courses").update({
          status: "queued",
          error_message: null,
          progress: 0,
          fix_attempts: fixAttempts,
          last_fix_strategy: errorAnalysis.fixStrategy,
        }).eq("id", courseId);

        const queueResult = await insertQueueEntry(supabase, courseId, restartStep, metadata);
        if (!queueResult.success) {
          console.error(`[retry] CRITICAL: Failed to queue ${restartStep} for course ${courseId}: ${queueResult.error}`);
          return new Response(JSON.stringify({
            success: false,
            error: `Failed to queue retry: ${queueResult.error}`
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // If there's a retry delay, wait before processing
        if (errorAnalysis.retryDelay > 0) {
          console.log(`[retry] Waiting ${errorAnalysis.retryDelay}ms before retry...`);
          await new Promise(r => setTimeout(r, Math.min(errorAnalysis.retryDelay, 30000)));
        }

        (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));

        return new Response(JSON.stringify({
          success: true,
          fixStrategy: errorAnalysis.fixStrategy,
          canAutoFix: errorAnalysis.canAutoFix
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ============ RESUME FAILED COURSE (recover from race condition) ============
      case "resume-failed": {
        if (!courseId) {
          return new Response(JSON.stringify({ error: "courseId is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch course data
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("id, status, frame_urls, transcript, title, email")
          .eq("id", courseId)
          .single();

        if (courseError || !course) {
          return new Response(JSON.stringify({ error: "Course not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (course.status !== 'failed') {
          return new Response(JSON.stringify({ error: "Course is not in failed state" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check for recoverable data
        const hasFrames = Array.isArray(course.frame_urls) && course.frame_urls.length > 0;
        const hasTranscript = course.transcript &&
          ((Array.isArray(course.transcript) && course.transcript.length > 0) ||
            (course.transcript.segments && course.transcript.segments.length > 0));

        if (!hasFrames && !hasTranscript) {
          return new Response(JSON.stringify({
            error: "No recoverable data found - please re-upload the video",
            hasFrames: false,
            hasTranscript: false
          }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[resume-failed] Course ${courseId} has recoverable data: frames=${hasFrames}, transcript=${hasTranscript}`);

        // Determine where to resume based on available data
        let resumeStep = "transcribe";
        let resumeProgress = 10;

        if (hasFrames && hasTranscript) {
          // Both available - resume at audio analysis
          resumeStep = "analyze_audio";
          resumeProgress = 60;
        } else if (hasFrames) {
          // Only frames - resume at transcription
          resumeStep = "transcribe";
          resumeProgress = 40;
        } else if (hasTranscript) {
          // Only transcript - resume at frame extraction
          resumeStep = "extract_frames";
          resumeProgress = 20;
        }

        // Update course status to processing
        await supabase.from("courses").update({
          status: "processing",
          progress: resumeProgress,
          error_message: null,
          last_heartbeat_at: new Date().toISOString(),
        }).eq("id", courseId);

        // Clear any existing failed/pending jobs for this course
        await supabase.from("processing_queue")
          .update({ status: "cancelled" })
          .eq("course_id", courseId)
          .in("status", ["pending", "failed"]);

        // Queue the resume step
        const queueResult = await insertQueueEntry(supabase, courseId, resumeStep, {
          isResume: true,
          hasFrames,
          hasTranscript,
        });

        if (!queueResult.success) {
          console.error(`[resume-failed] Failed to queue ${resumeStep} for course ${courseId}`);
          return new Response(JSON.stringify({
            success: false,
            error: `Failed to queue resume: ${queueResult.error}`
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Log the resume event
        await logJobEvent(supabase, getJobIdForCourse(courseId), {
          step: 'resume_failed',
          level: 'info',
          message: `Resumed failed course from ${resumeStep}`,
          metadata: { hasFrames, hasTranscript, resumeStep, resumeProgress }
        });

        console.log(`[resume-failed] Course ${courseId} resumed at ${resumeStep} (${resumeProgress}%)`);
        (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));

        return new Response(JSON.stringify({
          success: true,
          courseId,
          resumeStep,
          hasFrames,
          hasTranscript,
          message: `Resumed processing from ${resumeStep}`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ============ REPAIR STALLED MODULE (one-click recovery) ============
      case "repair-module": {
        const { moduleId } = body;

        if (!moduleId) {
          return new Response(JSON.stringify({ error: "moduleId is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch the module
        const { data: module, error: fetchError } = await supabase
          .from("course_modules")
          .select("*, courses(*)")
          .eq("id", moduleId)
          .single();

        if (fetchError || !module) {
          return new Response(JSON.stringify({ error: "Module not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if module is stalled (not completed/failed but no recent heartbeat)
        const stalledThreshold = 5 * 60 * 1000; // 5 minutes
        const lastHeartbeat = module.heartbeat_at ? new Date(module.heartbeat_at).getTime() : 0;
        const isStalled = !['completed', 'failed', 'queued', 'pending'].includes(module.status) &&
          (Date.now() - lastHeartbeat > stalledThreshold);

        // Check if module has usable partial data
        const hasTranscript = Array.isArray(module.transcript) && module.transcript.length > 0;
        const hasFrames = Array.isArray(module.frame_urls) && module.frame_urls.length > 0;
        const hasPartialData = hasTranscript || hasFrames;

        // Determine repair strategy
        let repairStrategy = 'restart';
        if (hasPartialData && module.retry_count >= 2) {
          // After 2+ retries with partial data, mark as partial-ready
          repairStrategy = 'mark_partial_ready';
        }

        const retryCount = (module.retry_count || 0) + 1;

        console.log(`[repair-module] Module ${moduleId} status=${module.status}, stalled=${isStalled}, hasPartialData=${hasPartialData}, strategy=${repairStrategy}`);

        // Log the repair attempt
        await supabase.from("error_logs").insert({
          course_id: module.course_id,
          module_id: moduleId,
          error_type: "repair",
          error_message: `Module repair requested (was ${module.status}, stalled=${isStalled})`,
          step: 'repair_module',
          fix_strategy: repairStrategy,
          fix_attempted: true,
          attempt_number: retryCount
        });

        if (repairStrategy === 'mark_partial_ready') {
          // Mark as completed with partial data note
          await supabase.from("course_modules").update({
            status: "completed",
            progress: 100,
            last_error: "Completed with partial data after multiple retries",
            completed_at: new Date().toISOString(),
          }).eq("id", moduleId);

          return new Response(JSON.stringify({
            success: true,
            moduleId,
            strategy: 'mark_partial_ready',
            message: 'Module marked as partial-ready for download'
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Reset the module to queued for reprocessing
        await supabase.from("course_modules").update({
          status: "queued",
          progress: 0,
          processing_state: "pending",
          last_error: null,
          error_message: null,
          retry_count: retryCount,
          heartbeat_at: new Date().toISOString(),
        }).eq("id", moduleId);

        // Reset the parent course if it was failed
        if (module.courses?.status === "failed") {
          await supabase.from("courses").update({
            status: "processing",
            error_message: null,
          }).eq("id", module.course_id);
        }

        // Queue the module for processing
        const queueResult = await insertQueueEntry(supabase, module.course_id, "transcribe_module", {
          moduleNumber: module.module_number,
          moduleId: moduleId,
          isRepair: true,
          retryAttempt: retryCount
        });

        if (!queueResult.success) {
          console.error(`[repair-module] CRITICAL: Failed to queue transcribe_module for module ${moduleId}`);
          return new Response(JSON.stringify({
            success: false,
            error: `Failed to queue repair: ${queueResult.error}`
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`[repair-module] Module ${moduleId} queued for repair (attempt ${retryCount})`);
        (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, module.course_id));

        return new Response(JSON.stringify({
          success: true,
          moduleId,
          strategy: 'restart',
          retryAttempt: retryCount
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ============ RETRY SPECIFIC MODULE ============
      case "retry-module": {
        const { moduleId } = body;

        if (!moduleId) {
          return new Response(JSON.stringify({ error: "moduleId is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch the module
        const { data: module, error: fetchError } = await supabase
          .from("course_modules")
          .select("*, courses(*)")
          .eq("id", moduleId)
          .single();

        if (fetchError || !module) {
          return new Response(JSON.stringify({ error: "Module not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Only allow retry on failed modules
        if (!["failed", "error"].includes(module.status) && !module.last_error) {
          return new Response(JSON.stringify({ error: "Module is not in failed state" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const retryCount = (module.retry_count || 0) + 1;

        // Log the retry attempt
        await supabase.from("error_logs").insert({
          course_id: module.course_id,
          module_id: moduleId,
          error_type: "retry",
          error_message: module.last_error || 'Module retry requested',
          step: 'retry_module',
          fix_strategy: "manual_module_retry",
          fix_attempted: true,
          attempt_number: retryCount
        });

        // Reset the module to queued
        await supabase.from("course_modules").update({
          status: "queued",
          progress: 0,
          processing_state: "pending",
          last_error: null,
          error_message: null,
          retry_count: retryCount,
          heartbeat_at: new Date().toISOString(),
        }).eq("id", moduleId);

        // Reset the parent course if it was failed
        if (module.courses?.status === "failed") {
          await supabase.from("courses").update({
            status: "processing",
            error_message: null,
          }).eq("id", module.course_id);
        }

        // Queue the module for processing
        const queueResult = await insertQueueEntry(supabase, module.course_id, "transcribe_module", {
          moduleNumber: module.module_number,
          moduleId: moduleId,
          isManualRetry: true,
          retryAttempt: retryCount
        });

        if (!queueResult.success) {
          console.error(`[retry-module] CRITICAL: Failed to queue transcribe_module for module ${moduleId}`);
          return new Response(JSON.stringify({
            success: false,
            error: `Failed to queue retry: ${queueResult.error}`
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`[retry-module] Module ${moduleId} queued for retry (attempt ${retryCount})`);
        (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, module.course_id));

        return new Response(JSON.stringify({
          success: true,
          moduleId,
          retryAttempt: retryCount
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ============ KICKSTART - MANUAL TRIGGER FOR STUCK/QUEUED COURSES ============
      case "kickstart": {
        if (!courseId) {
          return new Response(JSON.stringify({ error: "Missing courseId" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get course info
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("id, title, status, email, is_multi_module")
          .eq("id", courseId)
          .single();

        if (courseError || !course) {
          return new Response(JSON.stringify({ error: "Course not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Skip if already completed
        if (course.status === 'completed') {
          return new Response(JSON.stringify({
            success: true,
            message: "Course already completed!",
            status: 'completed'
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`[kickstart] Kickstarting course ${courseId} (status: ${course.status})`);

        // Check for pending queue entries for this course (CRITICAL: only non-purged)
        const { data: pendingJobs } = await supabase
          .from("processing_queue")
          .select("id, step, status")
          .eq("course_id", courseId)
          .eq("purged", false)
          .in("status", ["pending", "processing", "awaiting_webhook"])
          .limit(5);

        if (pendingJobs && pendingJobs.length > 0) {
          // Jobs exist - trigger processing
          console.log(`[kickstart] Found ${pendingJobs.length} pending jobs, triggering processing...`);
          (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));

          return new Response(JSON.stringify({
            success: true,
            message: `Processing triggered for ${pendingJobs.length} job(s)`,
            jobCount: pendingJobs.length
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // No pending jobs - need to determine what step to queue based on completed jobs
        // This handles courses stuck at intermediate progress with no active jobs
        console.log(`[kickstart] No active jobs for course ${courseId}, determining next step...`);

        // Get the last completed job to determine next step
        const { data: completedJobs } = await supabase
          .from("processing_queue")
          .select("step, completed_at")
          .eq("course_id", courseId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(5);

        const completedSteps = completedJobs?.map(j => j.step) || [];
        console.log(`[kickstart] Completed steps: ${completedSteps.join(', ') || 'none'}`);

        if (course.is_multi_module) {
          // Get modules that need processing
          const { data: modules } = await supabase
            .from("course_modules")
            .select("id, module_number, status, frame_urls")
            .eq("course_id", courseId)
            .eq("purged", false)
            .in("status", ["queued", "pending"])
            .order("module_number")
            .limit(3);

          if (modules && modules.length > 0) {
            console.log(`[kickstart] Creating queue entries for ${modules.length} modules...`);

            for (const mod of modules) {
              // Determine if module has pre-extracted frames
              const hasFrames = mod.frame_urls && Array.isArray(mod.frame_urls) && mod.frame_urls.length > 0;
              const step = hasFrames ? "transcribe_module" : "transcribe_and_extract_module";

              const queueResult = await insertQueueEntry(supabase, courseId, step, {
                moduleNumber: mod.module_number,
                kickstarted: true
              });
              if (queueResult.success) {
                console.log(`[kickstart] Queued module ${mod.module_number} with step ${step}`);
              }
            }

            (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));

            return new Response(JSON.stringify({
              success: true,
              message: `Created and triggered ${modules.length} processing job(s)`,
              modulesQueued: modules.length
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } else {
          // Single-module course - determine next step from completed steps
          let nextStep: string | null = null;

          // Check what's already completed to determine next step
          if (!completedSteps.includes("transcribe_and_extract") &&
            !completedSteps.includes("transcribe") &&
            !completedSteps.includes("extract_frames")) {
            nextStep = "transcribe_and_extract";
          } else if (!completedSteps.includes("analyze_audio") &&
            !completedSteps.includes("render_gifs")) {
            nextStep = "analyze_audio";
          } else if (!completedSteps.includes("train_ai")) {
            nextStep = "train_ai";
          }

          if (nextStep) {
            console.log(`[kickstart] Queueing next step: ${nextStep}`);

            const queueResult = await insertQueueEntry(supabase, courseId, nextStep, {
              kickstarted: true,
              previousSteps: completedSteps
            });

            if (queueResult.success) {
              // Update course status to processing if it was queued
              if (course.status === 'queued') {
                await supabase.from("courses").update({ status: 'processing' }).eq("id", courseId);
              }

              (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));

              return new Response(JSON.stringify({
                success: true,
                message: `Queued ${nextStep} and triggered processing`,
                step: nextStep
              }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } else {
              return new Response(JSON.stringify({
                success: false,
                message: `Failed to queue ${nextStep}: ${queueResult.error}`,
              }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }
        }

        // No action needed - just send kickstart signal
        (globalThis as any).EdgeRuntime?.waitUntil?.(processNextStep(supabase, courseId));

        return new Response(JSON.stringify({
          success: true,
          message: "Kickstart signal sent",
          note: "Processing will resume if there are pending steps",
          completedSteps
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ============ POLL FOR WORK (ATOMIC CLAIMING) ============
      case "poll": {
        const workerId = generateWorkerId();
        const VISIBILITY_SECONDS = 900; // 15 minutes
        let claimedCount = 0;

        // Claim up to 5 jobs atomically using the database function
        for (let i = 0; i < 5; i++) {
          const { data: claimedJob, error: claimError } = await supabase.rpc('claim_processing_job', {
            p_worker_id: workerId,
            p_visibility_seconds: VISIBILITY_SECONDS
          });

          if (claimError) {
            console.error(`[poll] claim_processing_job RPC failed:`, claimError);
            break; // RPC error - log and stop
          }

          if (!claimedJob || claimedJob.length === 0) {
            console.log(`[poll] No more pending jobs to claim after ${claimedCount} claims`);
            break; // No more jobs to claim
          }

          const job = claimedJob[0];
          console.log(`[poll] Worker ${workerId} claimed job ${job.job_id} (step: ${job.step})`);

          // Fetch full job data with course info
          const { data: fullJob } = await supabase
            .from("processing_queue")
            .select("*, courses(*)")
            .eq("id", job.job_id)
            .single();

          if (fullJob) {
            // Process in background, passing the worker ID for proper completion
            (globalThis as any).EdgeRuntime?.waitUntil?.(
              processJobWithWorker(supabase, fullJob, workerId)
            );
            claimedCount++;
          }
        }

        if (claimedCount === 0) {
          return new Response(JSON.stringify({ message: "No pending jobs" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ processing: claimedCount, workerId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ PROCESS SPECIFIC JOB (called by cron-poll-queue) ============
      case "process-job": {
        const { jobId, step, metadata, workerId } = body;

        if (!jobId || !courseId) {
          return new Response(JSON.stringify({ error: "Missing jobId or courseId" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[process-job] Processing job ${jobId} (step: ${step}, course: ${courseId}, worker: ${workerId})`);

        // Fetch the job to verify it's still claimed by this worker
        const { data: job, error: jobError } = await supabase
          .from("processing_queue")
          .select("*, courses(*)")
          .eq("id", jobId)
          .single();

        if (jobError || !job) {
          console.error(`[process-job] Job ${jobId} not found:`, jobError);
          return new Response(JSON.stringify({ error: "Job not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify worker still owns this job (prevent double-processing)
        if (job.claimed_by && job.claimed_by !== workerId) {
          console.warn(`[process-job] Job ${jobId} claimed by different worker: ${job.claimed_by} (we are ${workerId})`);
          return new Response(JSON.stringify({ error: "Job claimed by another worker" }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // ========== VISIBILITY EXTENSION FOR LONG-RUNNING JOBS ==========
        // Extend visibility every 5 minutes to prevent job being reclaimed mid-processing
        // This is critical for 2+ hour videos that may take 30-60 minutes to process
        const VISIBILITY_EXTENSION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
        const VISIBILITY_EXTENSION_SECONDS = 900; // 15 minutes each extension

        let visibilityExtenderInterval: number | null = null;

        const startVisibilityExtender = () => {
          visibilityExtenderInterval = setInterval(async () => {
            try {
              const extended = await supabase.rpc('extend_job_visibility', {
                p_job_id: jobId,
                p_worker_id: workerId,
                p_visibility_seconds: VISIBILITY_EXTENSION_SECONDS
              });
              if (extended.data) {
                console.log(`[process-job] Extended visibility for job ${jobId}`);
              } else {
                console.warn(`[process-job] Failed to extend visibility for job ${jobId} - may have been reclaimed`);
              }
            } catch (e) {
              console.warn(`[process-job] Visibility extension error:`, e);
            }
          }, VISIBILITY_EXTENSION_INTERVAL_MS);
        };

        const stopVisibilityExtender = () => {
          if (visibilityExtenderInterval !== null) {
            clearInterval(visibilityExtenderInterval);
            visibilityExtenderInterval = null;
          }
        };

        // Start the visibility extender before processing
        startVisibilityExtender();

        // Process the job using the atomic worker function
        try {
          await processJobWithWorker(supabase, job, workerId);

          // Stop visibility extender (processJobWithWorker handles completion internally)
          stopVisibilityExtender();

          console.log(`[process-job] Job ${jobId} completed successfully`);

          return new Response(JSON.stringify({
            success: true,
            jobId,
            message: "Job processed and completed"
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        } catch (processError) {
          // Stop visibility extender on failure too
          stopVisibilityExtender();

          const errorMessage = processError instanceof Error ? processError.message : 'Unknown processing error';
          console.error(`[process-job] Job ${jobId} failed:`, errorMessage);

          // Decide whether this is retryable (avoid infinite loops on permanently missing files)
          const normalizedError = normalizeMissingFileMessage(errorMessage);
          const { data: jobMeta } = await supabase
            .from('processing_queue')
            .select('attempt_count, max_attempts')
            .eq('id', jobId)
            .single();
          const currentAttempts = jobMeta?.attempt_count ?? 0;
          const maxAttempts = jobMeta?.max_attempts ?? 3;
          const shouldRetry = !isPermanentMissingFileError(errorMessage) && currentAttempts < maxAttempts;

          // Fail the job (will auto-retry if under max attempts)
          await supabase.rpc('fail_processing_job', {
            p_job_id: jobId,
            p_worker_id: workerId,
            p_error_message: normalizedError,
            p_should_retry: shouldRetry
          });

          return new Response(JSON.stringify({
            success: false,
            jobId,
            error: errorMessage
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ============ WATCHDOG - DETECT AND RECOVER STUCK JOBS ============
      case "watchdog": {
        const STUCK_THRESHOLD_MINUTES = 10;
        const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();

        let recoveredQueueJobs = 0;
        let recoveredIntermediate = 0;

        // 1) Find queue jobs stuck in "processing" for too long
        // CRITICAL FIX: Filter out purged jobs - they should be ignored by watchdog
        const { data: stuckJobs } = await supabase
          .from("processing_queue")
          .select("*, courses(id, title, email, purged)")
          .eq("status", "processing")
          .eq("purged", false)
          .lt("started_at", stuckThreshold)
          .order("started_at", { ascending: true })
          .limit(10);

        if (stuckJobs?.length) {
          console.log(`[watchdog] Found ${stuckJobs.length} stuck queue jobs, recovering...`);

          for (const job of stuckJobs) {
            const attempts = job.attempt_count || 0;
            const maxAttempts = job.max_attempts || 3;

            if (attempts < maxAttempts) {
              // CRITICAL FIX: Check if course is ACTUALLY completed (all modules done)
              // This handles race conditions and prevents resetting completely finished courses
              const { count: activeModulesCount } = await supabase
                .from("course_modules")
                .select("id", { count: 'exact', head: true })
                .eq("course_id", job.course_id)
                .neq("status", "completed")
                .eq("purged", false); // Only care about non-purged modules

              const { data: courseData } = await supabase
                .from("courses")
                .select("status")
                .eq("id", job.course_id)
                .single();

              if (courseData?.status === 'completed' || activeModulesCount === 0) {
                // Course is completed - just purge the stale queue job, don't reset course
                await supabase.from("processing_queue").update({
                  purged: true,
                  error_message: "Stale job - course already completed",
                }).eq("id", job.id);

                console.log(`[watchdog] Skipped recovery - course ${job.course_id} already completed, purged stale job`);
                continue; // Don't count as recovered, just cleanup
              }

              // Reset job to pending for retry
              await supabase.from("processing_queue").update({
                status: "pending",
                started_at: null,
                error_message: `Auto-recovered from stuck state after ${STUCK_THRESHOLD_MINUTES} minutes`,
              }).eq("id", job.id);

              await supabase.from("courses").update({
                status: "queued",
                error_message: null,
              }).eq("id", job.course_id);

              console.log(`[watchdog] Recovered job ${job.id} (attempt ${attempts + 1}/${maxAttempts})`);
              recoveredQueueJobs++;

              await supabase.from("error_logs").insert({
                course_id: job.course_id,
                error_type: "timeout",
                error_message: `Job stuck in ${job.step} for ${STUCK_THRESHOLD_MINUTES}+ minutes, auto-recovering`,
                step: job.step,
                fix_strategy: "auto_recovery",
                fix_attempted: true,
                attempt_number: attempts + 1,
              });
            } else {
              // Max retries reached - but FIRST check if data is already complete
              // This prevents false failure emails when data exists via webhook
              const { data: courseData } = await supabase
                .from("courses")
                .select("status, frame_urls, transcript")
                .eq("id", job.course_id)
                .single();

              const hasFrames = courseData?.frame_urls &&
                Array.isArray(courseData.frame_urls) &&
                courseData.frame_urls.length > 0;
              const hasTranscript = courseData?.transcript &&
                Object.keys(courseData.transcript).length > 0;
              const alreadyCompleted = courseData?.status === 'completed';

              // If data is complete, don't send failure email - course is actually OK
              if (alreadyCompleted || (hasFrames && hasTranscript)) {
                console.log(`[watchdog] Job ${job.id} timed out but course has complete data (frames: ${hasFrames}, transcript: ${hasTranscript}, status: ${courseData?.status}). Skipping failure email.`);

                // Mark job as completed (not failed) since data exists
                await supabase.from("processing_queue").update({
                  status: "completed",
                  error_message: `Job timed out but data was already complete via webhook`,
                }).eq("id", job.id);

                // Ensure course is marked completed if it has all data
                if (!alreadyCompleted && hasFrames && hasTranscript) {
                  await supabase.from("courses").update({
                    status: "completed",
                    completed_at: new Date().toISOString(),
                    error_message: null,
                  }).eq("id", job.course_id);
                  console.log(`[watchdog] Course ${job.course_id} auto-completed with existing data`);
                }
              } else {
                // Data is actually missing, mark as failed and send email
                await supabase.from("processing_queue").update({
                  status: "failed",
                  error_message: `Job stuck and exceeded max retry attempts (${maxAttempts})`,
                }).eq("id", job.id);

                await supabase.from("courses").update({
                  status: "failed",
                  error_message: "Processing timed out repeatedly. Please try uploading a shorter video or contact support.",
                }).eq("id", job.course_id);

                console.log(`[watchdog] Job ${job.id} marked as failed after ${maxAttempts} attempts`);

                if (job.courses) {
                  const errorAnalysis = classifyError("timeout");
                  await sendFailureEmail(
                    job.courses.email,
                    job.courses.title,
                    job.course_id,
                    "Processing timed out. Long videos may need to be split into smaller segments.",
                    errorAnalysis,
                  );
                }
              }
            }
          }
        } else {
          console.log("[watchdog] No stuck queue jobs found");
        }

        // 2) Detect intermediate stuck courses (course shows processing, but queue has no pending/processing)
        const { data: stuckIntermediate, error: stuckIntermediateError } = await supabase
          .rpc("detect_stuck_intermediate_states");

        if (stuckIntermediateError) {
          console.error("[watchdog] detect_stuck_intermediate_states failed:", stuckIntermediateError);
        }

        if (stuckIntermediate?.length) {
          console.log(`[watchdog] Found ${stuckIntermediate.length} intermediate-stuck courses, queueing missing steps...`);

          for (const row of stuckIntermediate) {
            if (!row.next_step) continue;

            const queueResult = await insertQueueEntry(supabase, row.course_id, row.next_step, {
              autoRecovery: true,
              detectedBy: "process-course.watchdog"
            });

            if (queueResult.success) {
              recoveredIntermediate++;
            } else {
              console.error(`[watchdog] CRITICAL: Failed to queue recovery step ${row.next_step} for course ${row.course_id}: ${queueResult.error}`);
            }
          }
        }

        // 3) Process any pending outbox events (emails, etc.)
        let outboxProcessed = 0;
        try {
          const { data: pendingEvents } = await supabase
            .from('processing_events')
            .select('id')
            .is('processed_at', null)
            .limit(100);

          outboxProcessed = pendingEvents?.length || 0;
          if (outboxProcessed > 0) {
            console.log(`[watchdog] Processing ${outboxProcessed} pending outbox events...`);
            await processOutboxEvents(supabase);
          }
        } catch (e) {
          console.warn('[watchdog] Outbox processing failed:', e);
        }

        // 4) Clean up expired leases (allow re-processing of abandoned jobs)
        let leasesCleanedUp = 0;
        try {
          const { data: expiredLeases, error: leaseError } = await supabase
            .from('module_leases')
            .delete()
            .lt('expires_at', new Date().toISOString())
            .is('released_at', null)
            .select();

          leasesCleanedUp = expiredLeases?.length || 0;
          if (leasesCleanedUp > 0) {
            console.log(`[watchdog] Cleaned up ${leasesCleanedUp} expired leases`);
          }
        } catch (e) {
          console.warn('[watchdog] Lease cleanup failed:', e);
        }

        // 5) Detect courses stuck in "queued" or "processing" status with progress but no active queue job
        // This catches courses that got stuck at intermediate progress (like 26%)
        let recoveredStuckProgress = 0;
        const { data: stuckProgressCourses } = await supabase
          .from("courses")
          .select("id, status, progress, title, is_multi_module")
          .eq("purged", false)
          .in("status", ["queued", "processing"])
          .gte("progress", 10)
          .lt("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .limit(10);

        if (stuckProgressCourses?.length) {
          for (const course of stuckProgressCourses) {
            // Check if there are any active (non-purged) queue jobs for this course
            const { data: activeJobs } = await supabase
              .from("processing_queue")
              .select("id")
              .eq("course_id", course.id)
              .eq("purged", false)
              .in("status", ["pending", "processing", "awaiting_webhook"])
              .limit(1);

            if (!activeJobs || activeJobs.length === 0) {
              console.log(`[watchdog] Course ${course.id} stuck at ${course.progress}% with no active jobs, recovering...`);

              // Determine what step to queue based on completed jobs
              const { data: completedJobs } = await supabase
                .from("processing_queue")
                .select("step")
                .eq("course_id", course.id)
                .eq("status", "completed")
                .order("completed_at", { ascending: false })
                .limit(5);

              const completedSteps = completedJobs?.map(j => j.step) || [];
              let nextStep: string | null = null;

              // Determine next step based on what's completed
              if (course.is_multi_module) {
                // For multi-module, check module status
                const { data: queuedModules } = await supabase
                  .from("course_modules")
                  .select("id, module_number, status")
                  .eq("course_id", course.id)
                  .eq("purged", false)
                  .in("status", ["queued", "pending"])
                  .order("module_number")
                  .limit(1);

                if (queuedModules?.length) {
                  nextStep = "transcribe_and_extract_module";
                  await insertQueueEntry(supabase, course.id, nextStep, {
                    moduleNumber: queuedModules[0].module_number,
                    autoRecovery: true,
                    detectedBy: "watchdog.stuck_progress"
                  });
                  recoveredStuckProgress++;
                }
              } else {
                // Single-module course - determine next step from completed steps
                if (!completedSteps.includes("transcribe_and_extract") && !completedSteps.includes("transcribe")) {
                  nextStep = "transcribe_and_extract";
                } else if (!completedSteps.includes("analyze_audio") && !completedSteps.includes("render_gifs")) {
                  nextStep = "analyze_audio";
                } else if (!completedSteps.includes("train_ai")) {
                  nextStep = "train_ai";
                }

                if (nextStep) {
                  const queueResult = await insertQueueEntry(supabase, course.id, nextStep, {
                    autoRecovery: true,
                    detectedBy: "watchdog.stuck_progress",
                    progress: course.progress
                  });
                  if (queueResult.success) {
                    console.log(`[watchdog] Queued ${nextStep} for stuck course ${course.id}`);
                    recoveredStuckProgress++;
                  }
                }
              }
            }
          }
        }

        // 6) Always kick pending work (not only when we recovered something)
        // CRITICAL FIX: Filter out purged jobs
        const { data: pendingJobs } = await supabase
          .from("processing_queue")
          .select("*, courses(*)")
          .eq("status", "pending")
          .eq("purged", false)
          .order("created_at", { ascending: true })
          .limit(5);

        // ATOMIC CLAIMING: Trigger poll action instead of direct job processing
        // This ensures all jobs go through the atomic claiming path
        if (pendingJobs && pendingJobs.length > 0) {
          await supabase.functions.invoke('process-course', {
            body: { action: 'poll' }
          }).catch((e: Error) => console.warn('[watchdog] Poll trigger failed:', e));
        }

        return new Response(JSON.stringify({
          message: `Watchdog complete`,
          recoveredQueueJobs,
          recoveredIntermediate,
          recoveredStuckProgress,
          outboxProcessed,
          leasesCleanedUp,
          pendingKicked: pendingJobs?.length || 0,
          checked: stuckJobs?.length || 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ HEALTH CHECK ============
      case "health": {
        // CRITICAL FIX: Filter out purged jobs - they shouldn't be counted as pending/processing
        const { data: stats } = await supabase
          .from("processing_queue")
          .select("status")
          .in("status", ["pending", "processing"])
          .eq("purged", false);

        const pending = stats?.filter((s: any) => s.status === "pending").length || 0;
        const processing = stats?.filter((s: any) => s.status === "processing").length || 0;

        return new Response(JSON.stringify({
          healthy: true,
          pending,
          processing,
          timestamp: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ GET COURSE ============
      case "get-course": {
        const { email } = body;
        if (!email || !courseId) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: course, error } = await supabase
          .from("courses")
          .select("*")
          .eq("id", courseId)
          .eq("email", email)
          .single();

        if (error) throw error;

        // If multi-module, fetch modules too
        if (course.is_multi_module) {
          const { data: modules } = await supabase
            .from("course_modules")
            .select("*")
            .eq("course_id", courseId)
            .order("module_number");
          course.modules = modules;
        }

        return new Response(JSON.stringify(course), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ DELETE COURSE (GOVERNANCE SOFT-DELETE) ============
      case "delete-course": {
        const { email } = body;
        if (!email || !courseId) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // First verify the course belongs to this email and is not already purged
        const { data: course, error: fetchError } = await supabase
          .from("courses")
          .select("id, email, title, video_url, purged")
          .eq("id", courseId)
          .eq("email", email)
          .eq("purged", false)
          .single();

        if (fetchError || !course) {
          return new Response(JSON.stringify({ error: "Course not found or access denied" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[delete-course] GOVERNANCE: Soft-deleting course ${courseId} (${course.title}) for ${email}`);

        // GOVERNANCE: Create execution frame for purge operation
        const { data: frameData, error: frameError } = await supabase
          .from("execution_frames")
          .insert({
            target_operation: "purge",
            target_entity: `course:${courseId}`,
            proposed_state: { purged: true, reason: "user_requested" },
            initiated_by: email,
            frame_type: "ai_execution",
            approval_status: "approved", // Auto-approved for owner deletion
            approved_at: new Date().toISOString(),
            approved_by: email,
          })
          .select("id")
          .single();

        if (frameError) {
          console.error(`[delete-course] Failed to create execution frame:`, frameError);
          throw frameError;
        }

        const purgeFrameId = frameData.id;
        const purgedAt = new Date().toISOString();

        // GOVERNANCE: Soft-delete related modules first
        await supabase
          .from("course_modules")
          .update({
            purged: true,
            purged_at: purgedAt,
            purged_by: email,
            purge_frame_id: purgeFrameId,
          })
          .eq("course_id", courseId);

        // GOVERNANCE: Soft-delete processing_queue entries
        // CRITICAL FIX: Also mark status as 'failed' to prevent them being counted as pending
        await supabase
          .from("processing_queue")
          .update({
            purged: true,
            purged_at: purgedAt,
            purged_by: email,
            purge_frame_id: purgeFrameId,
            status: 'failed',
            error_message: 'Purged: course deleted by user',
          })
          .eq("course_id", courseId);

        // GOVERNANCE: Soft-delete the course itself
        const { error: purgeError } = await supabase
          .from("courses")
          .update({
            purged: true,
            purged_at: purgedAt,
            purged_by: email,
            purge_frame_id: purgeFrameId,
          })
          .eq("id", courseId)
          .eq("email", email);

        if (purgeError) {
          console.error(`[delete-course] Soft-delete failed:`, purgeError);
          throw purgeError;
        }

        // Log state transition for audit trail
        await supabase.from("state_transitions").insert({
          entity_type: "course",
          entity_id: courseId,
          frame_id: purgeFrameId,
          from_state: { purged: false },
          to_state: { purged: true, purged_at: purgedAt, purged_by: email },
          transition_type: "purge",
          triggered_by: email,
        });

        // Mark execution frame as executed
        await supabase
          .from("execution_frames")
          .update({ executed: true, executed_at: new Date().toISOString() })
          .eq("id", purgeFrameId);

        // Try to clean up video from storage if it's in our bucket (optional, non-critical)
        if (course.video_url && course.video_url.includes('/storage/')) {
          try {
            await cleanupRawVideo(supabase, course.video_url);
          } catch (e) {
            console.warn(`[delete-course] Video cleanup failed (non-critical):`, e);
          }
        }

        console.log(`[delete-course] GOVERNANCE: Successfully soft-deleted course ${courseId} via frame ${purgeFrameId}`);

        return new Response(JSON.stringify({ success: true, purgeFrameId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ DELETE MODULE (GOVERNANCE SOFT-DELETE) ============
      case "delete-module": {
        const { email, moduleId } = body;
        if (!email || !moduleId) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch the module and verify ownership via course email
        const { data: module, error: fetchError } = await supabase
          .from("course_modules")
          .select("id, course_id, title, module_number, purged, courses(email)")
          .eq("id", moduleId)
          .eq("purged", false)
          .single();

        if (fetchError || !module) {
          return new Response(JSON.stringify({ error: "Module not found or access denied" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify ownership
        const courseOwnerEmail = (module.courses as any)?.email;
        if (courseOwnerEmail !== email) {
          return new Response(JSON.stringify({ error: "Access denied" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[delete-module] GOVERNANCE: Soft-deleting module ${moduleId} (${module.title}) for ${email}`);

        // GOVERNANCE: Create execution frame for purge operation
        const { data: frameData, error: frameError } = await supabase
          .from("execution_frames")
          .insert({
            target_operation: "purge",
            target_entity: `course_module:${moduleId}`,
            proposed_state: { purged: true, reason: "user_requested" },
            initiated_by: email,
            frame_type: "ai_execution",
            approval_status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: email,
          })
          .select("id")
          .single();

        if (frameError) {
          console.error(`[delete-module] Failed to create execution frame:`, frameError);
          throw frameError;
        }

        const purgeFrameId = frameData.id;
        const purgedAt = new Date().toISOString();

        // GOVERNANCE: Soft-delete the module
        const { error: purgeError } = await supabase
          .from("course_modules")
          .update({
            purged: true,
            purged_at: purgedAt,
            purged_by: email,
            purge_frame_id: purgeFrameId,
          })
          .eq("id", moduleId);

        if (purgeError) {
          console.error(`[delete-module] Soft-delete failed:`, purgeError);
          throw purgeError;
        }

        // Log state transition for audit trail
        await supabase.from("state_transitions").insert({
          entity_type: "course_module",
          entity_id: moduleId,
          frame_id: purgeFrameId,
          from_state: { purged: false },
          to_state: { purged: true, purged_at: purgedAt, purged_by: email },
          transition_type: "purge",
          triggered_by: email,
        });

        // Mark execution frame as executed
        await supabase
          .from("execution_frames")
          .update({ executed: true, executed_at: new Date().toISOString() })
          .eq("id", purgeFrameId);

        // CRITICAL: Also purge any processing_queue entries related to this module's course
        // This prevents the watchdog from re-kicking jobs for purged modules
        const courseId = module.course_id;

        // Check if there are any non-purged modules left for this course
        const { data: remainingModules } = await supabase
          .from("course_modules")
          .select("id")
          .eq("course_id", courseId)
          .eq("purged", false);

        const hasRemainingModules = remainingModules && remainingModules.length > 0;

        // Purge any pending/processing queue entries for this course if no modules remain
        // This prevents zombie jobs from being kicked by the watchdog
        if (!hasRemainingModules) {
          console.log(`[delete-module] All modules deleted for course ${courseId}, purging parent course and queue entries`);

          // Purge all processing_queue entries for this course (set status to 'failed' since 'cancelled' isn't valid)
          await supabase
            .from("processing_queue")
            .update({
              purged: true,
              purged_at: purgedAt,
              purged_by: email,
              purge_frame_id: purgeFrameId,
              status: 'failed',
              error_message: 'Purged: all modules deleted by user',
            })
            .eq("course_id", courseId)
            .in("status", ["pending", "processing"]);

          // Purge the parent course since all its modules are deleted
          await supabase
            .from("courses")
            .update({
              purged: true,
              purged_at: purgedAt,
              purged_by: email,
              purge_frame_id: purgeFrameId,
              status: 'failed',
              error_message: 'All modules deleted by user',
            })
            .eq("id", courseId);

          console.log(`[delete-module] GOVERNANCE: Auto-purged parent course ${courseId} (all modules deleted)`);
        } else {
          // Just cancel queue entries that might be referencing this specific module
          // by looking for metadata.moduleId or similar patterns
          console.log(`[delete-module] ${remainingModules.length} modules remain for course ${courseId}`);
        }

        console.log(`[delete-module] GOVERNANCE: Successfully soft-deleted module ${moduleId} via frame ${purgeFrameId}`);

        return new Response(JSON.stringify({ success: true, purgeFrameId, parentCoursePurged: !hasRemainingModules }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "process-outbox": {
        console.log('[process-outbox] Processing pending events...');
        await processOutboxEvents(supabase);

        // Get count of remaining unprocessed events
        const { data: pendingEvents } = await supabase
          .from('processing_events')
          .select('id')
          .is('processed_at', null)
          .limit(100);

        return new Response(JSON.stringify({
          success: true,
          pendingEvents: pendingEvents?.length || 0
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ GET EXPORT DATA (SALVAGE PATH) ============
      // Returns course/module data for PDF export even if not completed
      // CRITICAL: Limits frame_urls to MAX_EXPORT_FRAMES (evenly sampled) to prevent huge payloads
      case "get-export-data": {
        const { email, moduleNumber } = body;
        const MAX_EXPORT_FRAMES = 15000;

        // Helper: sample frames evenly across the array to represent full video duration
        const sampleFramesEvenly = (frames: string[], maxFrames: number): string[] => {
          if (!Array.isArray(frames) || frames.length <= maxFrames) return frames || [];
          const step = frames.length / maxFrames;
          const sampled: string[] = [];
          for (let i = 0; i < maxFrames; i++) {
            const idx = Math.floor(i * step);
            sampled.push(frames[idx]);
          }
          return sampled;
        };

        if (!courseId || !email) {
          return new Response(JSON.stringify({ error: "Missing courseId or email" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify course belongs to user
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("*")
          .eq("id", courseId)
          .eq("email", email)
          .single();

        if (courseError || !course) {
          return new Response(JSON.stringify({ error: "Course not found or access denied" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // If moduleNumber specified, get module data
        if (moduleNumber !== undefined) {
          const { data: module, error: moduleError } = await supabase
            .from("course_modules")
            .select("*")
            .eq("course_id", courseId)
            .eq("module_number", moduleNumber)
            .single();

          if (moduleError || !module) {
            return new Response(JSON.stringify({ error: "Module not found" }), {
              status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Check what data is available
          const rawFrameUrls = Array.isArray(module.frame_urls) ? module.frame_urls : [];
          const hasTranscript = Array.isArray(module.transcript) && module.transcript.length > 0;
          const hasFrames = rawFrameUrls.length > 0;
          const isPartial = module.status !== 'completed';

          // Sample frames evenly to prevent huge payloads
          const sampledFrameUrls = sampleFramesEvenly(rawFrameUrls, MAX_EXPORT_FRAMES);
          console.log(`[get-export-data] Module ${moduleNumber}: ${rawFrameUrls.length} total frames -> ${sampledFrameUrls.length} sampled`);

          return new Response(JSON.stringify({
            success: true,
            isPartial,
            hasTranscript,
            hasFrames,
            totalFrameCount: rawFrameUrls.length,
            module: {
              id: module.id,
              title: module.title,
              moduleNumber: module.module_number,
              courseTitle: course.title,
              video_duration_seconds: module.video_duration_seconds,
              transcript: module.transcript || [],
              frame_urls: sampledFrameUrls,
              audio_events: module.audio_events,
              prosody_annotations: module.prosody_annotations,
              status: module.status,
            }
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Return course-level data
        const rawCourseFrames = Array.isArray(course.frame_urls) ? course.frame_urls : [];
        const hasTranscript = Array.isArray(course.transcript) && course.transcript.length > 0;
        const hasFrames = rawCourseFrames.length > 0;
        const isPartial = course.status !== 'completed';

        // If multi-module course without direct data, try to get from first module
        let exportData: any = {
          id: course.id,
          title: course.title,
          video_duration_seconds: course.video_duration_seconds,
          transcript: course.transcript || [],
          frame_urls: sampleFramesEvenly(rawCourseFrames, MAX_EXPORT_FRAMES),
          audio_events: course.audio_events,
          prosody_annotations: course.prosody_annotations,
          status: course.status,
        };
        let totalFrameCount = rawCourseFrames.length;

        // For multi-module, if course level has no data, check modules
        if (!hasTranscript && !hasFrames && course.is_multi_module) {
          const { data: modules } = await supabase
            .from("course_modules")
            .select("*")
            .eq("course_id", courseId)
            .order("module_number");

          // Find first module with data
          const moduleWithData = modules?.find((m: any) =>
            (Array.isArray(m.transcript) && m.transcript.length > 0) ||
            (Array.isArray(m.frame_urls) && m.frame_urls.length > 0)
          );

          if (moduleWithData) {
            const modFrames = Array.isArray(moduleWithData.frame_urls) ? moduleWithData.frame_urls : [];
            totalFrameCount = modFrames.length;
            exportData = {
              id: moduleWithData.id,
              title: `${course.title} - ${moduleWithData.title}`,
              video_duration_seconds: moduleWithData.video_duration_seconds,
              transcript: moduleWithData.transcript || [],
              frame_urls: sampleFramesEvenly(modFrames, MAX_EXPORT_FRAMES),
              audio_events: moduleWithData.audio_events,
              prosody_annotations: moduleWithData.prosody_annotations,
              status: moduleWithData.status,
            };
          }
        }

        console.log(`[get-export-data] Course ${courseId}: ${totalFrameCount} total frames -> ${exportData.frame_urls.length} sampled`);

        return new Response(JSON.stringify({
          success: true,
          isPartial,
          hasTranscript: Array.isArray(exportData.transcript) && exportData.transcript.length > 0,
          hasFrames: exportData.frame_urls.length > 0,
          totalFrameCount,
          course: exportData,
          is_multi_module: course.is_multi_module,
          module_count: course.module_count,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: unknown) {
    console.error("[process-course] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============ BACKGROUND PROCESSING ============

// IMMEDIATE PROCESSING: Trigger poll action directly via fetch for reliability
// This ensures processing starts immediately without relying on cron
async function processNextStep(supabase: any, courseId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  console.log(`[processNextStep] Triggering immediate processing for course ${courseId}`);

  // Direct fetch is more reliable than supabase.functions.invoke inside edge functions
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/process-course`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ action: 'poll' })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[processNextStep] Poll triggered successfully:`, result);
    } else {
      console.warn(`[processNextStep] Poll returned ${response.status}`);
    }
  } catch (e) {
    console.warn('[processNextStep] Poll trigger failed:', e);
  }
}

// ============ OLD processJob REMOVED ============
// The old processJob() function (non-atomic) has been removed.
// All job processing now goes through processJobWithWorker() which uses:
// - claim_processing_job for atomic claiming with visibility timeouts
// - complete_processing_job for atomic completion
// - fail_processing_job for atomic failure handling with auto-retry
// This eliminates race conditions and duplicate processing.

// ATOMIC CLAIMING: Process a job with worker ID for proper completion
// This version uses claim_processing_job for proper locking and visibility timeouts
async function processJobWithWorker(supabase: any, job: any, workerId: string) {
  const { id: jobId, course_id: courseId, step, attempt_count, metadata } = job;
  const fixMetadata = metadata || {};

  console.log(`[processJobWithWorker] Worker ${workerId} processing job ${jobId}, step: ${step}`);

  // Get course email for concurrency tracking
  const { data: course } = await supabase.from("courses").select("email").eq("id", courseId).single();
  const userEmail = course?.email;

  // Track concurrency
  if (userEmail) {
    await incrementActiveJobs(supabase, userEmail);
  }

  // Start visibility extension interval (every 5 minutes)
  const VISIBILITY_EXTENSION_INTERVAL_MS = 5 * 60 * 1000;
  const VISIBILITY_EXTENSION_SECONDS = 900;

  const visibilityExtender = setInterval(async () => {
    try {
      const { data: extended } = await supabase.rpc('extend_job_visibility', {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_visibility_seconds: VISIBILITY_EXTENSION_SECONDS
      });
      if (extended) {
        console.log(`[processJobWithWorker] Extended visibility for job ${jobId}`);
      }
    } catch (e) {
      console.warn(`[processJobWithWorker] Visibility extension failed:`, e);
    }
  }, VISIBILITY_EXTENSION_INTERVAL_MS);

  // Start heartbeat for course/module
  const moduleId = fixMetadata?.moduleNumber ? await getModuleIdFromNumber(supabase, courseId, fixMetadata.moduleNumber) : undefined;
  const heartbeatInterval = createHeartbeatInterval(supabase, courseId, undefined, moduleId, jobId);

  // Update course heartbeat immediately
  await updateCourseHeartbeat(supabase, courseId);

  // If this is a module job, also update module heartbeat
  if (moduleId) {
    await updateModuleHeartbeat(supabase, moduleId);
  }

  // Structured logging
  const logJobId = fixMetadata?.moduleNumber
    ? getJobIdForModule(courseId, fixMetadata.moduleNumber)
    : getJobIdForCourse(courseId);

  await logJobEvent(supabase, logJobId, {
    step: 'worker_start',
    level: 'info',
    message: `Worker ${workerId} claimed job for step: ${step}`,
    metadata: {
      queue_job_id: jobId,
      course_id: courseId,
      step,
      attempt_count: (attempt_count || 0) + 1,
      module_number: fixMetadata?.moduleNumber || null,
      worker_id: workerId,
    }
  });

  try {
    // Execute the step
    switch (step) {
      // MULTI-VIDEO MODULE STITCHING: Concatenate multiple videos before processing
      case "stitch_videos":
        await stepStitchVideos(supabase, courseId, fixMetadata.moduleNumber || 1, fixMetadata);
        break;
      case "transcribe_and_extract":
        await stepTranscribeAndExtract(supabase, courseId, fixMetadata);
        break;
      case "transcribe_and_extract_module":
        await stepTranscribeAndExtractModule(supabase, courseId, fixMetadata.moduleNumber || 1, fixMetadata);
        break;
      case "transcribe":
        await stepTranscribe(supabase, courseId, fixMetadata);
        break;
      case "transcribe_module":
        await stepTranscribeModule(supabase, courseId, fixMetadata.moduleNumber || 1, fixMetadata);
        break;
      case "extract_frames":
        await stepExtractFrames(supabase, courseId, fixMetadata);
        break;
      case "extract_frames_module":
        await stepExtractFramesModule(supabase, courseId, fixMetadata.moduleNumber || 1, fixMetadata);
        break;
      case "render_gifs":
        await stepRenderGifs(supabase, courseId, fixMetadata);
        break;
      case "render_gifs_module":
        await stepRenderGifsModule(supabase, courseId, fixMetadata.moduleNumber || 1, fixMetadata);
        break;
      case "analyze_audio":
        await stepAnalyzeAudio(supabase, courseId);
        break;
      case "analyze_audio_module":
        await stepAnalyzeAudioModule(supabase, courseId, fixMetadata.moduleNumber || 1);
        break;
      case "train_ai":
        await stepTrainAi(supabase, courseId);
        break;
      case "train_ai_module":
        await stepTrainAiModule(supabase, courseId, fixMetadata.moduleNumber || 1);
        break;
    }

    // Cleanup
    clearInterval(visibilityExtender);
    clearInterval(heartbeatInterval);
    if (userEmail) {
      await decrementActiveJobs(supabase, userEmail);
    }

    // Log completion
    await logJobEvent(supabase, logJobId, {
      step: 'step_complete',
      level: 'info',
      message: `Step ${step} completed successfully by worker ${workerId}`,
      metadata: { queue_job_id: jobId, worker_id: workerId }
    });

    // Complete the job atomically using the worker ID
    await supabase.rpc('complete_processing_job', {
      p_job_id: jobId,
      p_worker_id: workerId
    });

    // Queue next step
    const nextStep = getNextStep(step, metadata);
    if (nextStep.step) {
      await insertQueueEntry(supabase, courseId, nextStep.step, nextStep.metadata ?? null);
    }

  } catch (error: unknown) {
    // Cleanup on error
    clearInterval(visibilityExtender);
    clearInterval(heartbeatInterval);

    // Handle webhook awaiting gracefully
    if (error instanceof Error && error.name === "AwaitWebhookSignal") {
      console.log(`[processJobWithWorker] Job ${jobId} awaiting webhooks - exiting gracefully`);
      if (userEmail) {
        await decrementActiveJobs(supabase, userEmail);
      }
      return;
    }

    if (userEmail) {
      await decrementActiveJobs(supabase, userEmail);
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[processJobWithWorker] Job ${jobId} failed:`, errorMessage);

    // Fail the job using the worker ID (avoid infinite loops on permanent missing-file errors)
    const normalizedError = normalizeMissingFileMessage(errorMessage);
    const currentAttempts = attempt_count ?? 0;
    const maxAttempts = (job as any)?.max_attempts ?? 3;
    const shouldRetry = !isPermanentMissingFileError(errorMessage) && currentAttempts < maxAttempts;

    await supabase.rpc('fail_processing_job', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error_message: normalizedError,
      p_should_retry: shouldRetry
    });
  }
}

// Helper to get module ID from course ID and module number
async function getModuleIdFromNumber(supabase: any, courseId: string, moduleNumber: number): Promise<string | undefined> {
  const { data } = await supabase
    .from("course_modules")
    .select("id")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();
  return data?.id;
}

function getNextStep(current: string, metadata?: any): { step: string | null; metadata?: any } {
  // Single video steps - check if we should skip frame extraction
  const skipFrameExtraction = metadata?.skipFrameExtraction || metadata?.hasPreExtractedFrames;

  // PARALLEL PROCESSING: After transcribe_and_extract completes, go to analyze_audio
  if (current === "transcribe_and_extract") {
    return { step: "analyze_audio", metadata };
  }

  // Legacy support: if transcribe completes and we have pre-extracted frames, skip to analyze_audio
  if (current === "transcribe" && skipFrameExtraction) {
    return { step: "analyze_audio", metadata };
  }

  // Legacy sequential pipeline (for backwards compatibility)
  // transcribe -> extract_frames -> analyze_audio -> train_ai
  const singleSteps = ["transcribe", "extract_frames", "analyze_audio", "train_ai"];
  const idx = singleSteps.indexOf(current);
  if (idx >= 0 && idx < singleSteps.length - 1) {
    return { step: singleSteps[idx + 1], metadata };
  }

  // Module steps - parallel processing
  if (current === "transcribe_and_extract_module") {
    return { step: "analyze_audio_module", metadata };
  }

  // Legacy module steps
  const moduleSteps = ["transcribe_module", "extract_frames_module", "analyze_audio_module", "train_ai_module"];
  const moduleIdx = moduleSteps.indexOf(current);
  if (moduleIdx >= 0) {
    if (moduleIdx < moduleSteps.length - 1) {
      return { step: moduleSteps[moduleIdx + 1], metadata };
    }
    // Last module step (train_ai_module) queues the next module/completion itself.
    return { step: null };
  }

  return { step: null };
}

// ============ MODULE PROCESSING STEPS ============

async function stepTranscribeModule(supabase: any, courseId: string, moduleNumber: number, fixMetadata?: any) {
  const { data: module } = await supabase
    .from("course_modules")
    .select("*, courses(*)")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();

  if (!module) throw new Error(`Module ${moduleNumber} not found`);

  await supabase.from("course_modules").update({
    status: "transcribing",
    progress: 5,
  }).eq("id", module.id);

  // Update parent course status
  await supabase.from("courses").update({
    status: `transcribing_module_${moduleNumber}`,
  }).eq("id", courseId);

  if (fixMetadata?.skipTranscription) {
    console.log(`[stepTranscribeModule] Skipping transcription for module ${moduleNumber}`);
    await supabase.from("course_modules").update({
      transcript: [],
      video_duration_seconds: 300,
      progress: 20,
    }).eq("id", module.id);
    return;
  }

  // Use webhook-based transcription (non-blocking)
  const result = await transcribeVideoWithWebhook(
    supabase, 
    module.id, 
    module.video_url, 
    'course_modules', 
    courseId, 
    moduleNumber,
    'transcribe_module'
  );

  if (result.webhookSubmitted) {
    // Mark current queue job as awaiting webhook callbacks
    await supabase.from("processing_queue")
      .update({ status: "awaiting_webhook" })
      .eq("course_id", courseId)
      .eq("status", "processing")
      .eq("step", "transcribe_module");

    console.log(`[stepTranscribeModule] Job submitted, awaiting webhook for module ${moduleNumber}`);
    
    // Throw a special "await webhook" signal that the caller should catch
    throw new AwaitWebhookSignal("Awaiting external webhook callbacks");
  }
  // If webhook not submitted (e.g. no audio), proceed to normal completion

}

async function stepExtractFramesModule(supabase: any, courseId: string, moduleNumber: number, fixMetadata?: any) {
  const { data: module } = await supabase
    .from("course_modules")
    .select("*, courses(*)")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();

  if (!module) throw new Error(`Module ${moduleNumber} not found`);

  await supabase.from("course_modules").update({
    status: "extracting_frames",
    progress: 25,
  }).eq("id", module.id);

  await supabase.from("courses").update({
    status: `extracting_frames_module_${moduleNumber}`,
  }).eq("id", courseId);

  await extractFrames(supabase, module.id, module.video_url, module.courses.fps_target, 'course_modules', fixMetadata);
}

// ============ MULTI-VIDEO MODULE STITCHING ============
async function stepStitchVideos(supabase: any, courseId: string, moduleNumber: number, fixMetadata?: any) {
  console.log(`[stitch_videos] Starting stitch for course ${courseId}, module ${moduleNumber}`);

  const { data: module } = await supabase
    .from("course_modules")
    .select("*, courses(*)")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();

  if (!module) throw new Error(`Module ${moduleNumber} not found`);

  const sourceVideos = fixMetadata?.sourceVideos || module.source_videos;

  if (!sourceVideos || sourceVideos.length <= 1) {
    // No stitching needed - just proceed to transcribe
    console.log(`[stitch_videos] Module ${moduleNumber} has single video, skipping stitch`);
    await supabase.from("course_modules").update({
      stitch_status: 'completed',
      stitched_video_url: module.video_url,
    }).eq("id", module.id);
    return;
  }

  // Update status
  await supabase.from("course_modules").update({
    stitch_status: 'stitching',
    heartbeat_at: new Date().toISOString(),
  }).eq("id", module.id);

  // For MVP: Use primary video (first in order) as the stitched video
  // Full stitching would require FFmpeg/Replicate integration
  const sortedVideos = [...sourceVideos].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  const primaryVideo = sortedVideos[0];

  console.log(`[stitch_videos] Module ${moduleNumber}: ${sourceVideos.length} videos, using primary: ${primaryVideo.filename}`);

  // Mark stitch as complete with primary video
  await supabase.from("course_modules").update({
    stitch_status: 'completed',
    stitched_video_url: primaryVideo.url,
    video_url: primaryVideo.url, // Update main video_url
  }).eq("id", module.id);

  console.log(`[stitch_videos] Module ${moduleNumber} stitch completed`);
}

async function stepRenderGifsModule(supabase: any, courseId: string, moduleNumber: number, _fixMetadata?: any) {
  const { data: module } = await supabase
    .from("course_modules")
    .select("*, courses(*)")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();

  if (!module) throw new Error(`Module ${moduleNumber} not found`);

  await supabase.from("course_modules").update({
    status: "rendering_gifs",
    progress: 55,
  }).eq("id", module.id);

  await supabase.from("courses").update({
    status: `rendering_gifs_module_${moduleNumber}`,
  }).eq("id", courseId);

  await renderGifs(supabase, module.id, 'course_modules');
}

async function stepTrainAiModule(supabase: any, courseId: string, moduleNumber: number) {
  const { data: module } = await supabase
    .from("course_modules")
    .select("*, courses(*)")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();

  if (!module) throw new Error(`Module ${moduleNumber} not found`);

  await supabase.from("course_modules").update({
    status: "training_ai",
    progress: 90,
  }).eq("id", module.id);

  await trainAiForModule(supabase, module);

  // Update module completion
  await supabase.from("course_modules").update({
    status: "completed",
    progress: 100,
    completed_at: new Date().toISOString(),
  }).eq("id", module.id);

  // Generate PDF data for this module (fire-and-forget, non-blocking)
  try {
    console.log(`[stepTrainAiModule] Generating PDF data for module ${moduleNumber}`);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-module-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
      },
      body: JSON.stringify({ moduleId: module.id })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[stepTrainAiModule] PDF data generated for module ${moduleNumber}:`, result.success);
    } else {
      console.warn(`[stepTrainAiModule] PDF generation returned ${response.status}`);
    }
  } catch (pdfError) {
    // Non-fatal - module is complete, PDF can be generated on-demand
    console.warn(`[stepTrainAiModule] PDF generation failed (non-fatal):`, pdfError);
  }

  // ZERO-KNOWLEDGE PURGE: Delete source video immediately after frame extraction
  // We retain only derivatives (frames), not the original content
  await purgeSourceVideo(supabase, module.video_url, courseId, module.id);

  // ATOMIC UPDATE: Use RPC to prevent race conditions during parallel module completion
  const { data: completionStatus, error: rpcError } = await supabase
    .rpc('increment_completed_modules', { p_course_id: courseId });

  if (rpcError) throw new Error(`Failed to increment course completion: ${rpcError.message}`);

  // RPC returns array of objects with single row
  const statusRow = Array.isArray(completionStatus) ? completionStatus[0] : completionStatus;
  const { is_finished } = statusRow;

  // Re-fetch course details needed for email/events
  const { data: course } = await supabase
    .from("courses")
    .select("email, title, module_count")
    .eq("id", courseId)
    .single();

  if (is_finished) {
    // All modules complete
    // EVENT OUTBOX: Emit course_completed event for reliable email delivery
    await emitProcessingEvent(supabase, 'course_completed', 'course', courseId, {
      email: course.email,
      courseTitle: course.title,
      courseId
    });

    // Process outbox immediately (fire-and-forget, will retry on next poll if fails)
    processOutboxEvents(supabase).catch(e => console.warn('[outbox] Background processing failed:', e));
  } else {
    // More modules to process
    // PARALLEL PROCESSING: Queue additional modules to maintain parallelism
    // Check how many module jobs are currently active
    const { data: activeCount } = await supabase.rpc('count_active_module_jobs', { p_course_id: courseId });
    const currentActiveJobs = activeCount || 0;
    const MAX_PARALLEL_MODULES = 3;
    const slotsAvailable = MAX_PARALLEL_MODULES - currentActiveJobs;

    if (slotsAvailable > 0) {
      // Find pending modules that aren't already queued
      const { data: pendingModules } = await supabase
        .from("course_modules")
        .select("module_number")
        .eq("course_id", courseId)
        .eq("status", "queued")
        .order("module_number", { ascending: true })
        .limit(slotsAvailable);

      // Queue the pending modules
      if (pendingModules && pendingModules.length > 0) {
        console.log(`[stepTrainAiModule] PARALLEL: Queueing ${pendingModules.length} more modules (${slotsAvailable} slots available)`);

        for (const mod of pendingModules) {
          // Check if this module is already in the queue
          const { data: existingJob } = await supabase
            .from("processing_queue")
            .select("id")
            .eq("course_id", courseId)
            .eq("step", "transcribe_and_extract_module")
            .eq("status", "pending")
            .contains("metadata", { moduleNumber: mod.module_number })
            .maybeSingle();

          if (!existingJob) {
            const queueResult = await insertQueueEntry(supabase, courseId, "transcribe_and_extract_module", {
              moduleNumber: mod.module_number
            });
            if (queueResult.success) {
              console.log(`[stepTrainAiModule] PARALLEL: Queued module ${mod.module_number}`);
            }
          }
        }
      }
    } else {
      console.log(`[stepTrainAiModule] PARALLEL: ${currentActiveJobs} jobs active, no slots available`);
    }

    // EVENT OUTBOX: Emit module_completed event for reliable email delivery
    await emitProcessingEvent(supabase, 'module_completed', 'module', module.id, {
      moduleId: module.id,
      email: course.email,
      courseTitle: course.title,
      moduleNumber,
      totalModules: course.module_count,
      courseId
    });

    // Process outbox immediately
    processOutboxEvents(supabase).catch(e => console.warn('[outbox] Background processing failed:', e));
  }
}

// ============ SHARED PROCESSING FUNCTIONS ============

// Webhook-based transcription - no polling, returns immediately
// The assemblyai-webhook function handles completion callbacks
async function transcribeVideoWithWebhook(
  supabase: any,
  recordId: string,
  videoUrl: string,
  tableName: string,
  courseId: string,
  moduleNumber?: number,
  step?: string
): Promise<{ transcriptId: string; webhookSubmitted: boolean }> {
  const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY not configured");

  // CRITICAL: Use resolveVideoUrlForExternalServices for proper signed URL + retry logic
  // This ensures the video is accessible before sending to AssemblyAI
  // The function retries up to 12 times with backoff to handle storage propagation delays
  const directVideoUrl = await resolveVideoUrlForExternalServices(supabase, videoUrl, {
    expiresInSeconds: 3600, // 1 hour - plenty of time for AssemblyAI to download
    maxAttempts: 15 // More attempts for freshly uploaded files
  });
  const logJobId = tableName === 'courses' ? getJobIdForCourse(recordId) : `module-${recordId.slice(0, 8)}`;

  console.log(`[transcribeVideoWithWebhook] Using signed URL: ${directVideoUrl.substring(0, 80)}...`);

  await logJobEvent(supabase, logJobId, {
    step: 'transcription_webhook_start',
    level: 'info',
    message: 'Starting AssemblyAI transcription with webhook callback',
    metadata: {
      record_id: recordId,
      table_name: tableName,
      course_id: courseId,
    }
  });

  // Build webhook URL with metadata as query params
  const webhookUrl = new URL(`${supabaseUrl}/functions/v1/assemblyai-webhook`);
  webhookUrl.searchParams.set("courseId", courseId);
  webhookUrl.searchParams.set("recordId", recordId);
  webhookUrl.searchParams.set("tableName", tableName);
  if (moduleNumber !== undefined) webhookUrl.searchParams.set("moduleNumber", String(moduleNumber));
  if (step) webhookUrl.searchParams.set("step", step);

  try {
    const submitResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        "Authorization": ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: directVideoUrl,
        language_detection: true,
        speaker_labels: true,
        webhook_url: webhookUrl.toString(),
      }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`AssemblyAI submission failed: ${submitResponse.status} - ${errorText}`);
    }

    const submitData = await submitResponse.json();
    const transcriptId = submitData.id;

    console.log(`[transcribeVideoWithWebhook] AssemblyAI job started: ${transcriptId}, webhook: ${webhookUrl.toString().substring(0, 80)}...`);

    await logJobEvent(supabase, logJobId, {
      step: 'transcription_webhook_submitted',
      level: 'info',
      message: `AssemblyAI job submitted with webhook callback`,
      metadata: {
        transcript_id: transcriptId,
        webhook_url_prefix: webhookUrl.toString().substring(0, 60),
      }
    });

    // Update progress to show transcription started
    await supabase.from(tableName).update({
      progress: 10,
    }).eq("id", recordId);

    return { transcriptId, webhookSubmitted: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    if (errorMsg.toLowerCase().includes("no audio") || errorMsg.toLowerCase().includes("audio_url")) {
      console.log(`[transcribeVideoWithWebhook] No audio detected, continuing without transcript`);
      await supabase.from(tableName).update({
        transcript: [],
        video_duration_seconds: 300,
        progress: 20,
        step_completed: { transcription_completed: true, transcription_skipped: true }
      }).eq("id", recordId);
      return { transcriptId: '', webhookSubmitted: false };
    }
    throw error;
  }
}

// Legacy polling-based transcription for backwards compatibility
async function transcribeVideo(supabase: any, recordId: string, videoUrl: string, tableName: string) {
  const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY not configured");

  // Get direct URL for supported platforms (Loom, Vimeo)
  const directVideoUrl = getDirectVideoUrl(videoUrl);

  // Determine job ID for logging
  const logJobId = tableName === 'courses' ? getJobIdForCourse(recordId) : `module-${recordId.slice(0, 8)}`;

  console.log(`[transcribeVideo] Using URL: ${directVideoUrl.substring(0, 80)}...`);

  // STRUCTURED LOGGING: Log transcription start
  await logJobEvent(supabase, logJobId, {
    step: 'transcription_start',
    level: 'info',
    message: 'Starting AssemblyAI transcription',
    metadata: {
      record_id: recordId,
      table_name: tableName,
      video_url_prefix: directVideoUrl.substring(0, 60),
    }
  });

  try {
    const submitResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        "Authorization": ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: directVideoUrl,
        language_detection: true,
        speaker_labels: true,
      }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`AssemblyAI submission failed: ${submitResponse.status} - ${errorText}`);
    }

    const submitData = await submitResponse.json();
    const transcriptId = submitData.id;

    console.log(`[transcribeVideo] AssemblyAI job started: ${transcriptId}`);

    // Poll for completion with heartbeat updates
    // 2+ hour videos can take 20-40 minutes to transcribe
    // 600 attempts × 3 second = 30 minutes max polling
    let attempts = 0;
    const maxAttempts = 600; // Doubled for 2+ hour videos
    const startTime = Date.now();
    let lastHeartbeat = Date.now();
    const HEARTBEAT_INTERVAL = 30000; // Update DB every 30 seconds

    // Pre-fetch course_id for modules to avoid repeated queries during heartbeats
    let parentCourseId: string | null = null;
    if (tableName === 'course_modules') {
      const { data: mod } = await supabase.from("course_modules").select("course_id").eq("id", recordId).single();
      parentCourseId = mod?.course_id || null;
    }

    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));

      const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { "Authorization": ASSEMBLYAI_API_KEY },
      });

      if (!statusResponse.ok) {
        // Retry on transient errors instead of failing
        if (statusResponse.status >= 500) {
          console.warn(`[transcribeVideo] AssemblyAI server error ${statusResponse.status}, retrying...`);
          attempts++;
          continue;
        }
        throw new Error(`AssemblyAI status check failed: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();

      if (statusData.status === "completed") {
        const segments: TranscriptSegment[] = statusData.utterances?.map((u: any) => ({
          start: u.start / 1000,
          end: u.end / 1000,
          text: u.text,
        })) || [];

        await supabase.from(tableName).update({
          transcript: segments,
          video_duration_seconds: statusData.audio_duration,
          progress: 20,
        }).eq("id", recordId);

        console.log(`[transcribeVideo] Completed with ${segments.length} segments, duration: ${statusData.audio_duration}s`);

        // STRUCTURED LOGGING: Log transcription completion
        await logJobEvent(supabase, logJobId, {
          step: 'transcription_complete',
          level: 'info',
          message: `Transcription completed: ${segments.length} segments, ${statusData.audio_duration}s duration`,
          metadata: {
            record_id: recordId,
            segment_count: segments.length,
            duration_seconds: statusData.audio_duration,
            poll_attempts: attempts,
          }
        });

        return;
      }

      if (statusData.status === "error") {
        throw new Error(statusData.error || "Transcription failed");
      }

      attempts++;
      const progress = 5 + Math.min(attempts * 0.025, 15); // Slower progress for longer videos

      // Heartbeat update every 30 seconds to prevent appearing stuck
      const now = Date.now();
      if (now - lastHeartbeat > HEARTBEAT_INTERVAL) {
        await supabase.from(tableName).update({ progress: Math.floor(progress) }).eq("id", recordId);

        // Update heartbeats + processing_queue.started_at to prevent watchdog from killing us
        if (tableName === 'courses') {
          await updateCourseHeartbeat(supabase, recordId);
          await supabase.from("processing_queue")
            .update({ started_at: new Date().toISOString() })
            .eq("course_id", recordId)
            .eq("status", "processing")
            .in("step", ["transcribe", "transcribe_and_extract"]);
        } else if (parentCourseId) {
          await updateModuleHeartbeat(supabase, recordId);
          await updateCourseHeartbeat(supabase, parentCourseId);
          await supabase.from("processing_queue")
            .update({ started_at: new Date().toISOString() })
            .eq("course_id", parentCourseId)
            .eq("status", "processing")
            .in("step", ["transcribe_module", "transcribe_and_extract_module"]);
        }

        // STRUCTURED LOGGING: Log heartbeat for forensics
        await logJobEvent(supabase, logJobId, {
          step: 'transcription_heartbeat',
          level: 'info',
          message: `Transcription in progress`,
          metadata: {
            record_id: recordId,
            attempt: attempts,
            max_attempts: maxAttempts,
            status: statusData.status,
            elapsed_seconds: Math.floor((now - startTime) / 1000),
          }
        }).catch(() => { }); // Don't fail on log errors

        lastHeartbeat = now;
        console.log(`[transcribeVideo] Heartbeat: attempt ${attempts}/${maxAttempts}, status: ${statusData.status}`);
      }
    }

    throw new Error(`Transcription timeout after ${maxAttempts * 3 / 60} minutes`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    if (errorMsg.toLowerCase().includes("no audio") || errorMsg.toLowerCase().includes("audio_url")) {
      console.log(`[transcribeVideo] No audio detected, continuing without transcript`);
      await supabase.from(tableName).update({
        transcript: [],
        video_duration_seconds: 300,
        progress: 20,
      }).eq("id", recordId);
      return;
    }
    throw error;
  }
}

// Webhook-based frame extraction - no polling, returns immediately
// The replicate-webhook function handles completion callbacks
async function extractFramesWithWebhook(
  supabase: any,
  recordId: string,
  videoUrl: string,
  fps: number,
  tableName: string,
  courseId: string,
  moduleNumber?: number,
  step?: string,
  fixMetadata?: any
): Promise<{ predictionId: string; webhookSubmitted: boolean }> {
  const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
  if (!REPLICATE_API_KEY) throw new Error("REPLICATE_API_KEY not configured");

  const directVideoUrl = await resolveVideoUrlForExternalServices(supabase, videoUrl);
  const resolution = fixMetadata?.lowerResolution ? 480 : 640;
  const logJobId = tableName === 'courses' ? getJobIdForCourse(recordId) : `module-${recordId.slice(0, 8)}`;

  await logJobEvent(supabase, logJobId, {
    step: 'frame_extraction_webhook_start',
    level: 'info',
    message: `Starting Replicate frame extraction with webhook callback at ${fps} FPS`,
    metadata: {
      record_id: recordId,
      table_name: tableName,
      course_id: courseId,
      fps,
      resolution,
    }
  });

  // Get latest model version
  const modelResponse = await fetch("https://api.replicate.com/v1/models/fofr/video-to-frames", {
    headers: { "Authorization": `Bearer ${REPLICATE_API_KEY}` },
  });

  if (!modelResponse.ok) throw new Error(`Failed to fetch model info: ${modelResponse.status}`);
  const modelData = await modelResponse.json();
  const latestVersionId = modelData.latest_version?.id;
  if (!latestVersionId) throw new Error("Could not find model version");

  // Build webhook URL
  const webhookUrl = `${supabaseUrl}/functions/v1/replicate-webhook`;

  // Webhook metadata is passed through Replicate's input and returned in the callback
  const webhookMetadata = {
    courseId,
    recordId,
    tableName,
    moduleNumber,
    fps,
    step,
  };

  // Retry with backoff for rate limiting AND 502/503 gateway errors
  let prediction = null;
  let retryAttempts = 0;
  const maxRetries = fixMetadata?.extendedDelay ? 15 : 10;

  while (!prediction && retryAttempts < maxRetries) {
    try {
      // Create prediction with webhook
      const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${REPLICATE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: latestVersionId,
          input: {
            video: directVideoUrl,
            fps: fps,
            width: resolution,
            webhook_metadata: webhookMetadata,
          },
          webhook: webhookUrl,
          webhook_events_filter: ["completed"],
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        const statusCode = createResponse.status;
        const isRetryable = statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504;

        if (isRetryable) {
          throw { response: { status: statusCode }, message: errorText };
        }
        throw new Error(`Replicate prediction failed: ${statusCode} - ${errorText}`);
      }

      prediction = await createResponse.json();
    } catch (error: any) {
      const statusCode = error?.response?.status || error?.status;
      const errorMsg = error?.message?.toLowerCase() || '';
      const isRetryable = statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504 ||
        errorMsg.includes('bad gateway') || errorMsg.includes('gateway') ||
        errorMsg.includes('timeout') || errorMsg.includes('network');

      if (isRetryable && retryAttempts < maxRetries - 1) {
        const isGatewayError = statusCode === 502 || statusCode === 503 || errorMsg.includes('gateway');
        const baseDelay = isGatewayError ? 15000 : (fixMetadata?.extendedDelay ? 30000 : 10000);
        const delay = baseDelay * Math.pow(1.5, retryAttempts);
        console.log(`[extractFramesWithWebhook] Retryable error (status=${statusCode}), attempt ${retryAttempts + 1}/${maxRetries}, waiting ${delay}ms...`);

        await logJobEvent(supabase, logJobId, {
          step: 'frame_extraction_webhook_retry',
          level: 'warn',
          message: `Replicate API error, retrying in ${Math.round(delay / 1000)}s`,
          metadata: { status_code: statusCode, attempt: retryAttempts + 1, max_retries: maxRetries }
        }).catch(() => { });

        await new Promise(r => setTimeout(r, delay));
        retryAttempts++;
      } else {
        throw error;
      }
    }
  }

  if (!prediction) throw new Error("Failed to start frame extraction after max retries");

  console.log(`[extractFramesWithWebhook] Replicate prediction started: ${prediction.id}, webhook registered`);

  await logJobEvent(supabase, logJobId, {
    step: 'frame_extraction_webhook_submitted',
    level: 'info',
    message: `Replicate prediction submitted with webhook callback`,
    metadata: {
      prediction_id: prediction.id,
      webhook_url: webhookUrl,
    }
  });

  // Update progress + progress_step to show extraction started.
  // IMPORTANT: for webhook-based extraction, we won't get intermediate progress updates,
  // so we set a clear step for the UI and bump heartbeats to prevent false "Paused".
  await supabase.from(tableName).update({
    progress: 25,
    progress_step: 'extracting_frames',
    // Store prediction ID for lazy progress updates in get-dashboard
    prediction_id: prediction.id,
  }).eq("id", recordId);

  // Best-effort heartbeat bump for the waiting period (no polling loop to update heartbeats).
  // This prevents the dashboard from marking long extractions as stalled.
  try {
    if (tableName === 'courses') {
      await updateCourseHeartbeat(supabase, recordId);
    } else {
      await updateModuleHeartbeat(supabase, recordId);
      await updateCourseHeartbeat(supabase, courseId);
    }
  } catch {
    // Ignore heartbeat failures
  }

  return { predictionId: prediction.id, webhookSubmitted: true };
}

// Legacy polling-based frame extraction for backwards compatibility
async function extractFrames(supabase: any, recordId: string, videoUrl: string, fps: number, tableName: string, fixMetadata?: any) {
  const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
  if (!REPLICATE_API_KEY) throw new Error("REPLICATE_API_KEY not configured");

  const Replicate = (await import("https://esm.sh/replicate@0.25.2")).default;
  const replicate = new Replicate({ auth: REPLICATE_API_KEY });

  // Get a URL that external services can fetch (signed URL for storage, direct for Loom/Vimeo/Zoom)
  const directVideoUrl = await resolveVideoUrlForExternalServices(supabase, videoUrl);

  const timeoutMultiplier = fixMetadata?.timeoutMultiplier || 1;
  const resolution = fixMetadata?.lowerResolution ? 480 : 640;

  // Determine job ID for logging
  const logJobId = tableName === 'courses' ? getJobIdForCourse(recordId) : `module-${recordId.slice(0, 8)}`;

  // STRUCTURED LOGGING: Log frame extraction start
  await logJobEvent(supabase, logJobId, {
    step: 'frame_extraction_start',
    level: 'info',
    message: `Starting Replicate frame extraction at ${fps} FPS`,
    metadata: {
      record_id: recordId,
      table_name: tableName,
      fps,
      resolution,
      timeout_multiplier: timeoutMultiplier,
    }
  });

  // Get latest model version
  const modelResponse = await fetch("https://api.replicate.com/v1/models/fofr/video-to-frames", {
    headers: { "Authorization": `Bearer ${REPLICATE_API_KEY}` },
  });

  if (!modelResponse.ok) throw new Error(`Failed to fetch model info: ${modelResponse.status}`);
  const modelData = await modelResponse.json();
  const latestVersionId = modelData.latest_version?.id;
  if (!latestVersionId) throw new Error("Could not find model version");

  // Retry with backoff for rate limiting AND 502/503 gateway errors
  let prediction = null;
  let retryAttempts = 0;
  const maxRetries = fixMetadata?.extendedDelay ? 15 : 10;

  while (!prediction && retryAttempts < maxRetries) {
    try {
      prediction = await replicate.predictions.create({
        version: latestVersionId,
        input: { video: directVideoUrl, fps: fps, width: resolution },
      });
    } catch (error: any) {
      const statusCode = error?.response?.status || error?.status;
      const errorMsg = error?.message?.toLowerCase() || '';
      const isRetryable = statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504 ||
        errorMsg.includes('bad gateway') || errorMsg.includes('gateway') ||
        errorMsg.includes('timeout') || errorMsg.includes('network');

      if (isRetryable) {
        // Use longer delays for gateway errors (service needs time to recover)
        const isGatewayError = statusCode === 502 || statusCode === 503 || errorMsg.includes('gateway');
        const baseDelay = isGatewayError ? 15000 : (fixMetadata?.extendedDelay ? 30000 : 10000);
        const delay = baseDelay * Math.pow(1.5, retryAttempts);
        console.log(`[extractFrames] Retryable error (status=${statusCode}), attempt ${retryAttempts + 1}/${maxRetries}, waiting ${delay}ms...`);

        await logJobEvent(supabase, logJobId, {
          step: 'frame_extraction_retry',
          level: 'warn',
          message: `Replicate API error, retrying in ${Math.round(delay / 1000)}s`,
          metadata: { status_code: statusCode, attempt: retryAttempts + 1, max_retries: maxRetries, error_message: errorMsg.slice(0, 200) }
        }).catch(() => { });

        await new Promise(r => setTimeout(r, delay));
        retryAttempts++;
      } else {
        throw error;
      }
    }
  }

  if (!prediction) throw new Error("Failed to start frame extraction after max retries");

  // Poll for completion with heartbeat updates
  let result = prediction;
  const baseTimeout = 7200000; // 2 hours
  const maxWaitTime = baseTimeout * timeoutMultiplier;
  const startTime = Date.now();
  let pollCount = 0;
  let lastHeartbeat = Date.now();
  const HEARTBEAT_INTERVAL = 30000; // Update DB every 30 seconds to prevent appearing stuck

  // Pre-fetch course_id for modules to avoid repeated queries during heartbeats
  let parentCourseId: string | null = null;
  if (tableName === 'course_modules') {
    const { data: mod } = await supabase.from("course_modules").select("course_id").eq("id", recordId).single();
    parentCourseId = mod?.course_id || null;
  }

  while (result.status !== "succeeded" && result.status !== "failed") {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitTime) throw new Error("Frame extraction timeout");

    await new Promise((r) => setTimeout(r, 5000));
    result = await replicate.predictions.get(prediction.id);
    pollCount++;

    // Heartbeat update - update progress periodically to prevent appearing stuck
    const now = Date.now();
    if (now - lastHeartbeat > HEARTBEAT_INTERVAL) {
      // Calculate progress between 25-50% based on time elapsed (assume max 30 min for extraction)
      const estimatedProgress = 25 + Math.min(25, (elapsed / 1800000) * 25);

      await supabase.from(tableName).update({
        progress: Math.floor(estimatedProgress),
      }).eq("id", recordId);

      // Update heartbeats + processing_queue.started_at to prevent watchdog from killing us
      if (tableName === 'courses') {
        await updateCourseHeartbeat(supabase, recordId);
        await supabase.from("processing_queue")
          .update({ started_at: new Date().toISOString() })
          .eq("course_id", recordId)
          .eq("status", "processing")
          .in("step", ["extract_frames", "transcribe_and_extract"]);
      } else if (parentCourseId) {
        await updateModuleHeartbeat(supabase, recordId);
        await updateCourseHeartbeat(supabase, parentCourseId);
        await supabase.from("processing_queue")
          .update({ started_at: new Date().toISOString() })
          .eq("course_id", parentCourseId)
          .eq("status", "processing")
          .in("step", ["extract_frames_module", "transcribe_and_extract_module"]);
      }

      // STRUCTURED LOGGING: Log heartbeat for forensics
      await logJobEvent(supabase, logJobId, {
        step: 'frame_extraction_heartbeat',
        level: 'info',
        message: `Frame extraction in progress`,
        metadata: {
          record_id: recordId,
          poll_count: pollCount,
          replicate_status: result.status,
          elapsed_seconds: Math.floor(elapsed / 1000),
        }
      }).catch(() => { }); // Don't fail on log errors

      lastHeartbeat = now;
      console.log(`[extractFrames] Heartbeat: ${pollCount} polls, ${Math.floor(elapsed / 1000)}s elapsed, status: ${result.status}`);
    }
  }

  if (result.status === "failed") throw new Error(result.error || "Frame extraction failed");

  const frameUrls = result.output || [];
  const elapsed = Date.now() - startTime;
  console.log(`[extractFrames] Extracted ${frameUrls.length} frames in ${Math.floor(elapsed / 1000)}s`);

  // STRUCTURED LOGGING: Log frame extraction completion
  await logJobEvent(supabase, logJobId, {
    step: 'frame_extraction_complete',
    level: 'info',
    message: `Frame extraction completed: ${frameUrls.length} frames in ${Math.floor(elapsed / 1000)}s`,
    metadata: {
      record_id: recordId,
      frame_count: frameUrls.length,
      duration_ms: elapsed,
      poll_count: pollCount,
    }
  });

  await supabase.from(tableName).update({
    frame_urls: frameUrls,
    total_frames: frameUrls.length,
    progress: 50,
  }).eq("id", recordId);
}

async function renderGifs(supabase: any, recordId: string, tableName: string) {
  const { data: record } = await supabase.from(tableName).select("*").eq("id", recordId).single();

  const frameUrls = record.frame_urls || [];
  if (frameUrls.length === 0) {
    console.log(`[renderGifs] No frames to process`);
    await supabase.from(tableName).update({ progress: 85, gif_storage_paths: [] }).eq("id", recordId);
    return;
  }

  const videoDuration = record.video_duration_seconds || 3600;
  const GIF_LENGTH_SECONDS = 120;
  const numGifs = Math.ceil(videoDuration / GIF_LENGTH_SECONDS);
  const framesPerGif = Math.ceil(frameUrls.length / numGifs);
  const FRAMES_PER_GIF = 120;

  const gifSegments = [];
  for (let i = 0; i < numGifs; i++) {
    const segmentStartFrame = i * framesPerGif;
    const segmentEndFrame = Math.min((i + 1) * framesPerGif, frameUrls.length);
    const segmentFrames = [];
    const step = Math.max(1, Math.floor((segmentEndFrame - segmentStartFrame) / FRAMES_PER_GIF));

    for (let j = segmentStartFrame; j < segmentEndFrame && segmentFrames.length < FRAMES_PER_GIF; j += step) {
      segmentFrames.push(frameUrls[j]);
    }

    gifSegments.push({
      frames: segmentFrames,
      startTime: (i / numGifs) * videoDuration,
      endTime: ((i + 1) / numGifs) * videoDuration,
    });

    await supabase.from(tableName).update({
      progress: 55 + ((i + 1) / numGifs) * 30,
      completed_gifs: i + 1,
      total_gifs: numGifs,
    }).eq("id", recordId);
  }

  await supabase.from(tableName).update({
    gif_storage_paths: gifSegments,
    progress: 85,
  }).eq("id", recordId);

  console.log(`[renderGifs] Prepared ${gifSegments.length} GIF segments`);
}

async function trainAiForModule(supabase: any, module: any) {
  const transcript = module.transcript || [];
  const frameUrls = module.frame_urls || [];

  const formattedTranscript = transcript.map((seg: TranscriptSegment) => {
    const timestamp = formatTimestamp(seg.start);
    return `[${timestamp}] ${seg.text}`;
  }).join("\n");

  const aiContext = `
# Module: ${module.title}

## Video Details
- Duration: ${formatDuration(module.video_duration_seconds)}
- Total Frames: ${frameUrls.length}

## Full Transcript with Timestamps
${formattedTranscript || "No audio transcript available for this module."}

## Frame Reference Guide
You have access to ${frameUrls.length} frames for this module.
`;

  await supabase.from("course_modules").update({
    ai_context: aiContext,
  }).eq("id", module.id);
}

// ============ PARALLEL PROCESSING STEPS (WEBHOOK-BASED) ============

// New webhook-based parallel processing - submits jobs and returns immediately
// Webhooks handle completion and queue the next step
async function stepTranscribeAndExtract(supabase: any, courseId: string, fixMetadata?: any) {
  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();

  // Check for force full extraction flag (ops override for large files)
  const forceFullExtraction = fixMetadata?.forceFullExtraction === true || fixMetadata?.bypassSizeLimit === true;

  // CHUNKED UPLOAD DETECTION: Check if this is a large chunked upload
  // Videos over ~500MB are uploaded in chunks and require special handling
  const chunkedInfo = await detectChunkedUpload(supabase, course.video_url);

  if (chunkedInfo?.isLargeFile) {
    const totalSizeBytes = chunkedInfo.totalSizeBytes || 0;
    const totalGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
    const chunkCount = chunkedInfo.manifest?.chunkCount || 1;

    console.log(`[stepTranscribeAndExtract] CHUNKED UPLOAD DETECTED: ${chunkCount} chunks, ${totalGB} GB`);

    // LARGE FILE HANDLING (>3GB): Use transcript-only mode UNLESS forceFullExtraction is set
    // Edge functions hit CPU/memory limits when streaming very large files through proxy
    // For these files, we skip frame extraction and generate text-based artifacts
    // BUT: ops can override with forceFullExtraction for critical users
    // Increased from 1.5GB to 3GB to support 5-8 hour videos encoded at reasonable quality
    const STREAMING_LIMIT_BYTES = 3 * 1024 * 1024 * 1024; // 3GB

    if (totalSizeBytes > STREAMING_LIMIT_BYTES && !forceFullExtraction) {
      console.log(`[stepTranscribeAndExtract] File too large for streaming (${totalGB} GB > 3GB limit)`);
      console.log(`[stepTranscribeAndExtract] Using TRANSCRIPT-ONLY mode for large file processing`);

      // Log for ops visibility
      await logJobEvent(supabase, getJobIdForCourse(courseId), {
        step: 'large_file_transcript_only',
        level: 'info',
        message: `Large file (${totalGB} GB) - using transcript-only mode, skipping frame extraction`,
        metadata: { chunkCount, totalGB, courseId, totalSizeBytes, streamingLimitGB: 3 }
      }).catch(() => { });

      // Get signed URL for the video (first chunk if manifest exists, or full video)
      const firstChunkPath = chunkedInfo.manifest?.chunks.find(c => c.order === 0)?.path ||
        parseSupabaseStorageObjectUrl(course.video_url)?.objectPath;

      if (firstChunkPath) {
        const { data: signedData } = await supabase.storage
          .from('video-uploads')
          .createSignedUrl(firstChunkPath, 7200); // 2 hour validity

        if (signedData?.signedUrl) {
          // Use first chunk's signed URL for transcription
          // Transcription services can handle partial content
          course._transcriptionUrl = signedData.signedUrl;
        }
      }

      // Mark that we're skipping frame extraction for large files
      course._isLargeFile = true;
      course._skipFrameExtraction = true;
      course._chunkCount = chunkCount;
      course._totalSizeGB = totalGB;

      // Update course to reflect transcript-only processing
      await supabase.from("courses").update({
        storage_path: course.video_url,
        density_mode: 'transcript_only',
        progress_step: 'transcribing_large_file',
      }).eq("id", courseId);
      // MEGA-VIDEO OPTIMIZATION: Trigger specialized chunk processing
      // This handles frame extraction with robust polling/progress updates
      // for both chunked and large single-file uploads.
      console.log(`[stepTranscribeAndExtract] Mega-Video detected: triggering specialized process-chunk flow`);

      await processChunkedVideo(supabase, courseId, course, chunkedInfo);

      // The processChunkedVideo function marks the queue as awaiting_webhook
      // but we still need to throw the signal to exit the current step handler
      throw new AwaitWebhookSignal("Mega-Video processing initiated via process-chunk");
    }
  }

  await supabase.from("courses").update({
    status: "processing",
    progress: 5,
    progress_step: "extracting_frames",
    started_at: new Date().toISOString(),
  }).eq("id", courseId);

  console.log(`[stepTranscribeAndExtract] Starting WEBHOOK-BASED parallel processing for course ${courseId}`);

  // Check if we should skip any steps
  const skipTranscription = fixMetadata?.skipTranscription;
  // Skip frame extraction for large files (>1.5GB) or if explicitly requested
  const skipFrameExtraction = fixMetadata?.skipFrameExtraction ||
    fixMetadata?.hasPreExtractedFrames ||
    course._skipFrameExtraction;

  // For large files, use transcript-only mode
  if (course._isLargeFile && course._skipFrameExtraction) {
    console.log(`[stepTranscribeAndExtract] Large file detected (${course._totalSizeGB} GB) - transcript-only mode`);

    // Update progress step to reflect transcript-only processing
    await supabase.from("courses").update({
      progress_step: "transcribing_audio",
      progress: 10,
    }).eq("id", courseId);
  }

  // If both are skipped, continue to next step immediately
  if (skipTranscription && skipFrameExtraction) {
    console.log(`[stepTranscribeAndExtract] Both steps skipped, proceeding directly`);
    await supabase.from("courses").update({
      progress: 50,
      step_completed: { transcription_completed: true, frames_extracted: true }
    }).eq("id", courseId);
    return; // Will proceed to next step via normal flow
  }

  // Initialize step tracking
  const stepCompleted: Record<string, boolean> = {
    transcription_completed: skipTranscription || false,
    frames_extracted: skipFrameExtraction || false,
  };

  // Start transcription with webhook
  if (!skipTranscription) {
    try {
      const result = await transcribeVideoWithWebhook(
        supabase, courseId, course.video_url, 'courses', courseId, undefined, 'transcribe_and_extract'
      );
      if (!result.webhookSubmitted) {
        // No audio or other skip condition - mark as complete
        stepCompleted.transcription_completed = true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Chunked upload errors should have been handled earlier
      // If we get here, it means the streaming URL approach failed
      if (errorMessage.includes('CHUNKED_UPLOAD_DETECTED')) {
        console.log(`[stepTranscribeAndExtract] Ignoring legacy chunked error - streaming should handle this`);
        // Don't fail - let transcription proceed or skip gracefully
        stepCompleted.transcription_completed = true;
        await supabase.from("courses").update({
          transcript: [],
          ai_context: "Transcription skipped for chunked upload. AI will analyze visual content.",
        }).eq("id", courseId);
      } else {
        console.error(`[stepTranscribeAndExtract] Transcription webhook submission error:`, error);
        // Continue without transcript - frames are more critical
        stepCompleted.transcription_completed = true;
        await supabase.from("courses").update({
          transcript: [],
          ai_context: "This video has no audio transcript. The AI will analyze visual content only.",
        }).eq("id", courseId);
      }
    }
  }

  // Start frame extraction with webhook
  if (!skipFrameExtraction) {
    try {
      await extractFramesWithWebhook(
        supabase, courseId, course.video_url, course.fps_target || 3, 'courses',
        courseId, undefined, 'transcribe_and_extract', fixMetadata
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Chunked upload errors should have been handled via streaming
      // If we still get this error, log it and try to continue
      if (errorMessage.includes('CHUNKED_UPLOAD_DETECTED')) {
        console.error(`[stepTranscribeAndExtract] Chunked upload error during extraction - streaming proxy may have failed`);

        // Check if this is a streaming URL that failed differently
        if (course._isChunkedStreaming) {
          console.error(`[stepTranscribeAndExtract] Streaming proxy approach failed for chunked upload`);
          const totalGB = course._totalSizeGB || 'unknown';
          const chunkCount = course._chunkCount || 'unknown';

          await supabase.from("courses").update({
            status: "failed",
            error_message: `This ${totalGB}GB video (${chunkCount} chunks) could not be processed via streaming. ` +
              `Please try: (1) Upload to Loom/Vimeo and paste the share link, or (2) Compress to under 5GB and re-upload.`,
          }).eq("id", courseId);
          throw error;
        }
      }

      console.error(`[stepTranscribeAndExtract] Frame extraction webhook submission error:`, error);
      throw error; // Frame extraction is critical
    }
  }

  // Store initial step_completed state
  await supabase.from("courses").update({
    step_completed: stepCompleted,
  }).eq("id", courseId);

  // If both were skipped or completed synchronously, proceed normally
  if (stepCompleted.transcription_completed && stepCompleted.frames_extracted) {
    await supabase.from("courses").update({
      progress: 50,
    }).eq("id", courseId);
    return; // Will proceed to next step via normal flow
  }

  // Mark current queue job as awaiting webhook callbacks
  await supabase.from("processing_queue")
    .update({ status: "awaiting_webhook" })
    .eq("course_id", courseId)
    .eq("status", "processing")
    .eq("step", "transcribe_and_extract");

  console.log(`[stepTranscribeAndExtract] Jobs submitted, awaiting webhooks for course ${courseId}`);

  // Throw a special "await webhook" signal that the caller should catch
  // This prevents the normal "complete and queue next" flow
  throw new AwaitWebhookSignal("Awaiting external webhook callbacks");
}

async function stepTranscribeAndExtractModule(supabase: any, courseId: string, moduleNumber: number, fixMetadata?: any) {
  const { data: module } = await supabase
    .from("course_modules")
    .select("*, courses(*)")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();

  if (!module) throw new Error(`Module ${moduleNumber} not found`);

  await supabase.from("course_modules").update({
    status: "processing",
    progress: 5,
  }).eq("id", module.id);

  await supabase.from("courses").update({
    status: `processing_module_${moduleNumber}`,
  }).eq("id", courseId);

  console.log(`[stepTranscribeAndExtractModule] Starting WEBHOOK-BASED parallel processing for module ${moduleNumber}`);

  const skipTranscription = fixMetadata?.skipTranscription;
  const skipFrameExtraction = fixMetadata?.hasPreExtractedFrames;

  if (skipTranscription && skipFrameExtraction) {
    await supabase.from("course_modules").update({
      progress: 50,
      step_completed: { transcription_completed: true, frames_extracted: true }
    }).eq("id", module.id);
    return;
  }

  const stepCompleted: Record<string, boolean> = {
    transcription_completed: skipTranscription || false,
    frames_extracted: skipFrameExtraction || false,
  };

  // Start transcription with webhook
  if (!skipTranscription) {
    try {
      const result = await transcribeVideoWithWebhook(
        supabase, module.id, module.video_url, 'course_modules',
        courseId, moduleNumber, 'transcribe_and_extract_module'
      );
      if (!result.webhookSubmitted) {
        stepCompleted.transcription_completed = true;
      }
    } catch (error) {
      console.error(`[stepTranscribeAndExtractModule] Transcription error:`, error);
      stepCompleted.transcription_completed = true;
      await supabase.from("course_modules").update({
        transcript: [],
      }).eq("id", module.id);
    }
  }

  // Start frame extraction with webhook
  if (!skipFrameExtraction) {
    try {
      await extractFramesWithWebhook(
        supabase, module.id, module.video_url, module.courses.fps_target || 3,
        'course_modules', courseId, moduleNumber, 'transcribe_and_extract_module', fixMetadata
      );
    } catch (error) {
      console.error(`[stepTranscribeAndExtractModule] Frame extraction error:`, error);
      throw error;
    }
  }

  await supabase.from("course_modules").update({
    step_completed: stepCompleted,
  }).eq("id", module.id);

  if (stepCompleted.transcription_completed && stepCompleted.frames_extracted) {
    await supabase.from("course_modules").update({
      progress: 50,
    }).eq("id", module.id);
    return;
  }

  // Mark as awaiting webhook
  await supabase.from("processing_queue")
    .update({ status: "awaiting_webhook" })
    .eq("course_id", courseId)
    .eq("status", "processing")
    .eq("step", "transcribe_and_extract_module");

  console.log(`[stepTranscribeAndExtractModule] Jobs submitted, awaiting webhooks for module ${moduleNumber}`);

  throw new AwaitWebhookSignal("Awaiting external webhook callbacks");
}

// Special error class to signal that we're waiting for webhooks
// This allows the processing loop to exit gracefully without marking as failed
class AwaitWebhookSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwaitWebhookSignal";
  }
}

// ============ SINGLE VIDEO STEPS (unchanged logic) ============

async function stepTranscribe(supabase: any, courseId: string, fixMetadata?: any) {
  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();

  await supabase.from("courses").update({
    status: "transcribing",
    progress: 5,
    started_at: new Date().toISOString(),
  }).eq("id", courseId);

  if (fixMetadata?.skipTranscription) {
    console.log(`[stepTranscribe] Skipping transcription due to fix strategy`);
    await supabase.from("courses").update({
      transcript: [],
      video_duration_seconds: 300,
      progress: 20,
      ai_context: "This video has no audio. The AI will analyze visual content only.",
    }).eq("id", courseId);
    return;
  }

  // Use webhook-based transcription (non-blocking)
  const result = await transcribeVideoWithWebhook(
    supabase, 
    courseId, 
    course.video_url, 
    'courses', 
    courseId, 
    undefined, 
    'transcribe'
  );

  if (result.webhookSubmitted) {
    // Mark current queue job as awaiting webhook callbacks
    await supabase.from("processing_queue")
      .update({ status: "awaiting_webhook" })
      .eq("course_id", courseId)
      .eq("status", "processing")
      .eq("step", "transcribe");

    console.log(`[stepTranscribe] Job submitted, awaiting webhook for course ${courseId}`);
    
    // Throw a special "await webhook" signal that the caller should catch
    throw new AwaitWebhookSignal("Awaiting external webhook callbacks");
  }
  // If webhook not submitted (e.g. no audio), proceed to normal completion

}

async function stepExtractFrames(supabase: any, courseId: string, fixMetadata?: any) {
  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();

  await supabase.from("courses").update({
    status: "extracting_frames",
    progress: 25,
    progress_step: "extracting_frames",
  }).eq("id", courseId);

  // Chunked uploads (manifest-based) must be streamed via our proxy so external services
  // can fetch the *full* video without triggering CHUNKED_UPLOAD_DETECTED.
  const chunkedInfo = await detectChunkedUpload(supabase, course.video_url);
  if (chunkedInfo?.isChunked) {
    const streamingUrl = `${supabaseUrl}/functions/v1/stream-chunked-video?courseId=${courseId}`;

    await logJobEvent(supabase, getJobIdForCourse(courseId), {
      step: 'chunked_extract_frames_reroute',
      level: 'info',
      message: 'Chunked upload detected in extract_frames; using streaming proxy for full extraction',
      metadata: {
        courseId,
        manifestPath: chunkedInfo.manifestPath,
        chunkCount: chunkedInfo.manifest?.chunkCount,
        totalSize: chunkedInfo.manifest?.totalSize,
      }
    }).catch(() => { });

    // Submit Replicate job with webhook (no polling) and let replicate-webhook persist frames + queue next steps.
    await extractFramesWithWebhook(
      supabase,
      courseId,
      streamingUrl,
      course.fps_target || 3,
      'courses',
      courseId,
      undefined,
      'extract_frames',
      fixMetadata
    );

    // Mark current queue job as awaiting webhook callbacks.
    await supabase.from("processing_queue")
      .update({ status: "awaiting_webhook" })
      .eq("course_id", courseId)
      .eq("status", "processing")
      .eq("step", "extract_frames");

    throw new AwaitWebhookSignal("Awaiting external webhook callbacks");
  }

  // Non-chunked uploads: keep legacy polling-based extraction.
  await extractFrames(supabase, courseId, course.video_url, course.fps_target || 3, 'courses', fixMetadata);
}

async function stepRenderGifs(supabase: any, courseId: string, fixMetadata?: any) {
  await supabase.from("courses").update({
    status: "rendering_gifs",
    progress: 55,
    progress_step: "generating_artifact",
  }).eq("id", courseId);

  await renderGifs(supabase, courseId, 'courses');
}

// ============ AUDIO ANALYSIS STEPS ============

async function stepAnalyzeAudio(supabase: any, courseId: string) {
  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();

  await supabase.from("courses").update({
    status: "analyzing_audio",
    progress: 87,
    progress_step: "analyzing",
  }).eq("id", courseId);

  console.log(`[stepAnalyzeAudio] Starting audio analysis for course ${courseId}`);

  try {
    // Call analyze-audio-prosody for screenplay parentheticals
    const prosodyResult = await analyzeAudioProsody(course);

    // Call analyze-audio-events for music, ambient, reactions, pauses
    const eventsResult = await analyzeAudioEvents(course);

    // Store results
    await supabase.from("courses").update({
      prosody_annotations: prosodyResult,
      audio_events: eventsResult,
      progress: 90,
    }).eq("id", courseId);

    console.log(`[stepAnalyzeAudio] Audio analysis complete for course ${courseId}`);
  } catch (error) {
    console.error(`[stepAnalyzeAudio] Audio analysis failed:`, error);
    // Don't fail the whole pipeline - audio analysis is optional enhancement
    await supabase.from("courses").update({
      prosody_annotations: null,
      audio_events: null,
      progress: 90,
    }).eq("id", courseId);
  }
}

async function stepAnalyzeAudioModule(supabase: any, courseId: string, moduleNumber: number) {
  const { data: module } = await supabase
    .from("course_modules")
    .select("*, courses(*)")
    .eq("course_id", courseId)
    .eq("module_number", moduleNumber)
    .single();

  if (!module) throw new Error(`Module ${moduleNumber} not found`);

  await supabase.from("course_modules").update({
    status: "analyzing_audio",
    progress: 87,
  }).eq("id", module.id);

  await supabase.from("courses").update({
    status: `analyzing_audio_module_${moduleNumber}`,
  }).eq("id", courseId);

  console.log(`[stepAnalyzeAudioModule] Starting audio analysis for module ${moduleNumber}`);

  try {
    // Build module-like object for analysis functions
    const moduleData = {
      ...module,
      title: module.title,
      video_url: module.video_url,
      transcript: module.transcript,
      video_duration_seconds: module.video_duration_seconds,
    };

    const prosodyResult = await analyzeAudioProsody(moduleData);
    const eventsResult = await analyzeAudioEvents(moduleData);

    await supabase.from("course_modules").update({
      prosody_annotations: prosodyResult,
      audio_events: eventsResult,
      progress: 90,
    }).eq("id", module.id);

    console.log(`[stepAnalyzeAudioModule] Audio analysis complete for module ${moduleNumber}`);
  } catch (error) {
    console.error(`[stepAnalyzeAudioModule] Audio analysis failed:`, error);
    await supabase.from("course_modules").update({
      prosody_annotations: null,
      audio_events: null,
      progress: 90,
    }).eq("id", module.id);
  }
}

// ============ AUDIO ANALYSIS HELPER FUNCTIONS ============

async function analyzeAudioProsody(record: any): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-audio-prosody`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoUrl: record.video_url,
        transcript: record.transcript || [],
        videoDuration: record.video_duration_seconds,
      }),
    });

    if (!response.ok) {
      console.error('[analyzeAudioProsody] Failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.success ? data : null;
  } catch (error) {
    console.error('[analyzeAudioProsody] Error:', error);
    return null;
  }
}

async function analyzeAudioEvents(record: any): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-audio-events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoUrl: record.video_url,
        transcript: record.transcript || [],
        videoDuration: record.video_duration_seconds,
        courseTitle: record.title,
      }),
    });

    if (!response.ok) {
      console.error('[analyzeAudioEvents] Failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.success ? data : null;
  } catch (error) {
    console.error('[analyzeAudioEvents] Error:', error);
    return null;
  }
}

async function stepTrainAi(supabase: any, courseId: string) {
  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();

  // FIX: Update progress_step to 'finalizing' for UI tracking
  await supabase.from("courses").update({
    status: "training_ai",
    progress: 90,
    progress_step: "finalizing",
  }).eq("id", courseId);

  const transcript = course.transcript || [];
  let frameUrls = course.frame_urls || [];

  // ========== SAFEGUARD #2: FINAL VERIFICATION BEFORE COMPLETION ==========
  // Check if this is a chunked upload FIRST - these have special handling
  const isChunkedUpload = course.chunked === true || course.chunk_count > 1;
  const hasValidTranscript = Array.isArray(transcript) && transcript.length > 0;
  const jobId = getJobIdForCourse(courseId);

  // For chunked uploads (10GB+ files): skip frame backfill attempts entirely
  // These files can't be processed by Replicate due to Edge Function timeouts
  if (isChunkedUpload) {
    console.log(`[stepTrainAi] CHUNKED UPLOAD DETECTED: chunk_count=${course.chunk_count}, frames=${frameUrls.length}, transcript_segments=${transcript.length}`);

    if (!Array.isArray(frameUrls) || frameUrls.length === 0) {
      // Chunked uploads without frames - allow completion with transcript or minimal artifact
      console.warn(`[stepTrainAi] Chunked upload has no frames - proceeding with transcript-only mode`);

      await logJobEvent(supabase, jobId, {
        step: 'chunked_upload_completion',
        level: 'info',
        message: `Large file (${course.chunk_count} chunks): completing ${hasValidTranscript ? 'with transcript' : 'with minimal artifact'}`,
        metadata: {
          course_id: courseId,
          chunk_count: course.chunk_count,
          transcript_segments: transcript.length,
          video_duration: course.video_duration_seconds
        }
      });

      // Ensure frameUrls is an empty array for UI compatibility
      frameUrls = [];
    }

    // For chunked uploads: always allow completion, even without transcript
    // The user uploaded a massive file - we should deliver SOMETHING
  } else if (!Array.isArray(frameUrls) || frameUrls.length === 0) {
    // NON-CHUNKED UPLOAD: Attempt frame backfill
    console.warn(`[stepTrainAi] SAFEGUARD #2: No frames found for course ${courseId}. Attempting re-pull...`);

    await logJobEvent(supabase, jobId, {
      step: 'completion_blocked_no_frames',
      level: 'warn',
      message: 'Zero frames detected, triggering backfill',
      metadata: { course_id: courseId, video_url: course.video_url }
    });

    // Attempt to backfill frames from persist-frames edge function
    try {
      console.log(`[stepTrainAi] Invoking persist-frames for backfill...`);
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const backfillResponse = await fetch(`${supabaseUrl}/functions/v1/persist-frames`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({
          courseId,
          moduleId: null,
          maxFrames: 200,
          forceReExtract: true
        })
      });

      if (backfillResponse.ok) {
        const backfillResult = await backfillResponse.json();
        if (backfillResult.success && backfillResult.persistedUrls?.length > 0) {
          console.log(`[stepTrainAi] BACKFILL SUCCESS: Retrieved ${backfillResult.persistedUrls.length} frames`);
          frameUrls = backfillResult.persistedUrls;

          await supabase.from("courses").update({
            frame_urls: frameUrls,
            total_frames: frameUrls.length,
          }).eq("id", courseId);

          await logJobEvent(supabase, jobId, {
            step: 'frame_backfill_succeeded',
            level: 'info',
            message: `Backfill recovered ${frameUrls.length} frames`,
            metadata: { frame_count: frameUrls.length }
          });
        } else {
          console.warn(`[stepTrainAi] Backfill returned no frames`);
        }
      } else {
        console.warn(`[stepTrainAi] Backfill request failed: ${backfillResponse.status}`);
      }
    } catch (backfillError) {
      console.error(`[stepTrainAi] Backfill exception:`, backfillError);
    }

    // After backfill attempt, check again - but still allow completion with transcript
    if (!Array.isArray(frameUrls) || frameUrls.length === 0) {
      if (hasValidTranscript) {
        console.warn(`[stepTrainAi] No frames but transcript available - proceeding with transcript-only artifact`);
        frameUrls = [];
      } else {
        // No frames AND no transcript - fail for non-chunked uploads
        console.error(`[stepTrainAi] BLOCKING COMPLETION: No frames and no transcript`);

        await logJobEvent(supabase, jobId, {
          step: 'completion_blocked_permanently',
          level: 'error',
          message: 'Course completion BLOCKED: no frames and no transcript',
          metadata: { course_id: courseId }
        });

        await supabase.from("courses").update({
          status: "failed",
          error_message: "Processing failed: No visual frames or transcript could be extracted",
          progress_step: "failed",
        }).eq("id", courseId);

        throw new Error(`SAFEGUARD #2: Cannot complete course ${courseId} with zero frames and no transcript`);
      }
    }
  }

  console.log(`[stepTrainAi] Frame verification passed: ${frameUrls.length} frames available`);

  const formattedTranscript = transcript.map((seg: TranscriptSegment) => {
    const timestamp = formatTimestamp(seg.start);
    return `[${timestamp}] ${seg.text}`;
  }).join("\n");

  // Note: isChunkedUpload and hasValidTranscript already defined above
  const isTranscriptOnly = frameUrls.length === 0;

  const hasAnyContent = hasValidTranscript || frameUrls.length > 0;

  const aiContext = `
# Course: ${course.title}

## Video Details
- Duration: ${formatDuration(course.video_duration_seconds)}
- Total Frames: ${frameUrls.length}${isTranscriptOnly ? ' (large file - transcript mode)' : ''}
- Density: ${course.density_mode} (${course.fps_target} FPS)
${isChunkedUpload ? `- Upload Type: Large file (${course.chunk_count || 0} chunks)` : ''}

## Full Transcript with Timestamps
${formattedTranscript || '(Transcript not available for this video)'}

## ${!hasAnyContent ? 'Processing Note' : isTranscriptOnly ? 'Note: Large File Mode' : 'Frame Reference Guide'}
${!hasAnyContent
      ? 'This artifact was generated for a large chunked upload where frame extraction and transcription could not complete. The source video has been stored for future processing improvements.'
      : isTranscriptOnly
        ? `This artifact was generated in transcript-only mode for a large chunked upload (${course.chunk_count || 0} chunks). Visual frame extraction is not yet supported for files of this size but the full transcript is available above.`
        : `You have access to ${frameUrls.length} frames extracted at ${course.fps_target} FPS.`}
`;

  // FIX: Include progress_step: "completed" for UI tracking
  await supabase.from("courses").update({
    ai_context: aiContext,
    status: "completed",
    progress: 100,
    progress_step: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", courseId);

  console.log(`[stepTrainAi] Training complete for course ${courseId} with ${frameUrls.length} verified frames`);

  // ONEDUO ARTIFACT GENERATION: Create transformation artifact for visual emphasis analysis
  // This is the core OneDuo patent - visual intent detection from frames
  // Works in frames-only mode even without transcript
  if (course.user_id && frameUrls.length > 0) {
    try {
      console.log(`[stepTrainAi] Creating OneDuo transformation artifact for user ${course.user_id}`);

      // Create the transformation artifact record
      const { data: artifact, error: artifactError } = await supabase
        .from("transformation_artifacts")
        .insert({
          user_id: course.user_id,
          video_title: course.title,
          video_url: course.video_url || '',
          duration_seconds: course.video_duration_seconds || 30,
          frame_count: frameUrls.length,
          status: 'processing',
        })
        .select()
        .single();

      if (artifactError) {
        console.error(`[stepTrainAi] Failed to create artifact:`, artifactError);
      } else {
        console.log(`[stepTrainAi] Artifact created: ${artifact.id}, invoking process-transformation`);

        // Invoke the process-transformation function to detect emphasis signals
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        await fetch(`${supabaseUrl}/functions/v1/process-transformation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
          },
          body: JSON.stringify({ artifactId: artifact.id })
        }).catch(err => {
          console.warn(`[stepTrainAi] process-transformation invocation failed (non-fatal):`, err);
        });
      }
    } catch (artifactErr) {
      // Non-fatal - course is complete, artifact can be generated on-demand
      console.warn(`[stepTrainAi] OneDuo artifact generation failed (non-fatal):`, artifactErr);
    }
  } else {
    console.log(`[stepTrainAi] Skipping artifact generation: user_id=${course.user_id}, frames=${frameUrls.length}`);
  }

  // ZERO-KNOWLEDGE PURGE: Delete source video immediately after frame extraction
  // We retain only derivatives (frames), not the original content
  await purgeSourceVideo(supabase, course.video_url, courseId);

  // EVENT OUTBOX: Emit course_completed event for reliable email delivery
  await emitProcessingEvent(supabase, 'course_completed', 'course', courseId, {
    email: course.email,
    courseTitle: course.title,
    courseId
  });

  // Process outbox immediately
  processOutboxEvents(supabase).catch(e => console.warn('[outbox] Background processing failed:', e));
}

// ============ ZERO-KNOWLEDGE STORAGE PURGE ============
// Ghost Upload Architecture: Original videos are purged immediately after frame extraction
// We retain only: derivatives (frames), transformations (OCR text), artifacts (PDF)
// We CANNOT comply with requests for original content because we do not possess it

async function purgeSourceVideo(
  supabase: any,
  videoUrl: string | null,
  courseId?: string,
  moduleId?: string
): Promise<void> {
  if (!videoUrl) return;

  try {
    // Extract the storage path from the video URL
    // Supports both buckets: video-uploads and course-videos
    // URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
    let storagePath: string | null = null;

    // Try video-uploads bucket first
    const videoUploadsMatch = videoUrl.match(/\/video-uploads\/(.+)$/);
    if (videoUploadsMatch) {
      storagePath = `video-uploads/${decodeURIComponent(videoUploadsMatch[1])}`;
    }

    // Try course-videos bucket
    if (!storagePath) {
      const courseVideosMatch = videoUrl.match(/\/course-videos\/(.+)$/);
      if (courseVideosMatch) {
        storagePath = `course-videos/${decodeURIComponent(courseVideosMatch[1])}`;
      }
    }

    if (!storagePath) {
      console.log(`[purgeSourceVideo] Could not extract path from URL, may be external: ${videoUrl.substring(0, 80)}...`);
      return;
    }

    console.log(`[purgeSourceVideo] ZERO-KNOWLEDGE PURGE: ${storagePath}`);

    // Call the dedicated purge edge function for proper audit logging
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const response = await fetch(`${supabaseUrl}/functions/v1/purge-source-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
      },
      body: JSON.stringify({
        courseId,
        moduleId,
        storagePath,
        method: 'automatic'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[purgeSourceVideo] SUCCESS: ${result.success}, auditId: ${result.auditLogId}`);
    } else {
      const errorText = await response.text();
      console.error(`[purgeSourceVideo] Purge function returned ${response.status}: ${errorText}`);

      // Fallback: direct deletion if edge function fails (but no audit log)
      // Extract bucket and path from storagePath
      const parts = storagePath.split('/');
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) {
        console.error(`[purgeSourceVideo] Fallback delete failed: ${error.message}`);
      } else {
        console.log(`[purgeSourceVideo] Fallback delete succeeded (no audit log)`);
      }
    }
  } catch (err) {
    console.error(`[purgeSourceVideo] Error:`, err);

    // Non-fatal: module/course processing should continue even if purge fails
    // The cron job will clean up any orphaned files later
  }
}

// Legacy alias for backwards compatibility
async function cleanupRawVideo(supabase: any, videoUrl: string | null) {
  return purgeSourceVideo(supabase, videoUrl);
}

// ============ EMAIL NOTIFICATIONS ============

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} minutes`;
}

async function sendCompletionEmail(supabase: any, email: string, courseTitle: string, courseId: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.log("[sendCompletionEmail] No RESEND_API_KEY configured");
    return;
  }

  const resend = new Resend(resendApiKey);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  // Use tracked download endpoint for analytics attribution
  const downloadUrl = `${supabaseUrl}/functions/v1/track-download?courseId=${courseId}&source=email`;

  // Get course to check for team notification email
  const { data: course } = await supabase
    .from("courses")
    .select("team_notification_email, team_notification_role")
    .eq("id", courseId)
    .single();

  const teamEmail = course?.team_notification_email;

  try {
    // 1. Send to owner - The Secrets Have Been Distilled
    await resend.emails.send({
      from: "OneDuo <hello@oneduo.ai>",
      to: [email],
      subject: `Your OneDuo Intel Artifact is Ready`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #111111; border-radius: 16px; overflow: hidden;">
                  
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 24px; text-align: center;">
                      <p style="margin: 0; color: #00d4ff; font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">OneDuo</p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 0 40px 24px;">
                      <h2 style="margin: 0 0 20px; color: #ffffff; font-size: 26px; font-weight: 600; line-height: 1.3;">The secrets have been distilled.</h2>
                      <p style="margin: 0 0 16px; color: #cccccc; font-size: 15px; line-height: 1.7;">
                        The OneDuo is ready. We have successfully extracted the AI's Thinking Layer from your video, preserving the proprietary knowledge and expert nuances that standard AI misses.
                      </p>
                      <p style="margin: 0; color: #cccccc; font-size: 15px; line-height: 1.7;">
                        Your AI is now equipped with the eyes to see exactly what is in this video—the way an expert would.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- CTA Button -->
                  <tr>
                    <td style="padding: 0 40px 32px; text-align: center;">
                      <a href="${downloadUrl}" style="display: inline-block; background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%); color: #000000; font-size: 15px; font-weight: 600; text-decoration: none; padding: 16px 36px; border-radius: 8px;">
                        Access the Thinking Layer Intel Here
                      </a>
                    </td>
                  </tr>
                  
                  <!-- Proprietary Rights Notice -->
                  <tr>
                    <td style="padding: 0 40px 16px;">
                      <p style="margin: 0 0 8px; color: #888888; font-size: 13px; font-weight: 600;">Notice of Proprietary Rights:</p>
                      <p style="margin: 0 0 12px; color: #666666; font-size: 12px; line-height: 1.6;">
                        This artifact contains distilled proprietary intel intended for authorized educational purposes only. Accessing this work confirms that the necessary permissions have been secured and that this knowledge will be used solely for the authorized party.
                      </p>
                      <p style="margin: 0; color: #666666; font-size: 12px; line-height: 1.6;">
                        This content is a trust; it is not to be resold or redistributed.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Expiry Warning -->
                  <tr>
                    <td style="padding: 0 40px 40px; text-align: center;">
                      <p style="margin: 0; color: #555555; font-size: 11px;">
                        Access link is secure and will expire in 24 hours.
                      </p>
                    </td>
                  </tr>
                  
                </table>
                
                <!-- Subtle footer -->
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin-top: 24px;">
                  <tr>
                    <td style="text-align: center;">
                      <p style="margin: 0; color: #333333; font-size: 12px;">
                        — OneDuo
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("[sendCompletionEmail] Owner email sent successfully");

    // Mark owner as notified
    await supabase.from("courses").update({
      owner_notified_at: new Date().toISOString(),
    }).eq("id", courseId);

    // 2. Send to team member/VA if configured - elevated brand tone
    if (teamEmail) {
      await resend.emails.send({
        from: "OneDuo <hello@oneduo.ai>",
        to: [teamEmail],
        subject: `Your OneDuo Intel Artifact is Ready`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #111111; border-radius: 16px; overflow: hidden;">
                    
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 24px; text-align: center;">
                        <p style="margin: 0; color: #00d4ff; font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">OneDuo</p>
                      </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                      <td style="padding: 0 40px 24px;">
                        <h2 style="margin: 0 0 20px; color: #ffffff; font-size: 24px; font-weight: 600; line-height: 1.3;">The secrets have been distilled.</h2>
                        <p style="margin: 0 0 16px; color: #cccccc; font-size: 15px; line-height: 1.7;">
                          The OneDuo artifact for <strong style="color: #ffffff;">${courseTitle}</strong> is ready. We have successfully extracted the AI's Thinking Layer, preserving the proprietary knowledge and expert nuances that standard AI misses.
                        </p>
                        <p style="margin: 0; color: #cccccc; font-size: 15px; line-height: 1.7;">
                          Your AI is now equipped with the eyes to see exactly what is in this video—the way an expert would.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- CTA Button -->
                    <tr>
                      <td style="padding: 0 40px 32px; text-align: center;">
                        <a href="${downloadUrl}" style="display: inline-block; background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%); color: #000000; font-size: 15px; font-weight: 600; text-decoration: none; padding: 16px 36px; border-radius: 8px;">
                          Access the Thinking Layer Intel Here
                        </a>
                      </td>
                    </tr>
                    
                    <!-- Proprietary Rights Notice -->
                    <tr>
                      <td style="padding: 0 40px 16px;">
                        <p style="margin: 0 0 8px; color: #888888; font-size: 13px; font-weight: 600;">Notice of Proprietary Rights:</p>
                        <p style="margin: 0 0 12px; color: #666666; font-size: 12px; line-height: 1.6;">
                          This artifact contains distilled proprietary intel intended for authorized educational purposes only. Accessing this work confirms that the necessary permissions have been secured and that this knowledge will be used solely for the authorized party.
                        </p>
                        <p style="margin: 0; color: #666666; font-size: 12px; line-height: 1.6;">
                          This content is a trust; it is not to be resold or redistributed.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Expiry Warning -->
                    <tr>
                      <td style="padding: 0 40px 40px; text-align: center;">
                        <p style="margin: 0; color: #555555; font-size: 11px;">
                          Access link is secure and will expire in 24 hours.
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                  
                  <!-- Subtle footer -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin-top: 24px;">
                    <tr>
                      <td style="text-align: center;">
                        <p style="margin: 0; color: #333333; font-size: 12px;">
                          — OneDuo
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });
      console.log(`[sendCompletionEmail] Team email sent to ${teamEmail}`);

      // Mark team as notified
      await supabase.from("courses").update({
        team_notified_at: new Date().toISOString(),
      }).eq("id", courseId);
    }
  } catch (err) {
    console.error("[sendCompletionEmail] Failed:", err);
  }
}

// PRODUCTION HARDENING: Idempotent per-module email sending
// Uses mark_module_email_sent() to ensure email is only sent once per module
async function sendModuleCompleteEmailIdempotent(
  supabase: any,
  moduleId: string,
  email: string,
  courseTitle: string,
  moduleNumber: number,
  totalModules: number,
  courseId: string
) {
  // Check if we should send (atomically marks as sent if not already)
  const shouldSend = await shouldSendModuleEmail(supabase, moduleId);
  if (!shouldSend) {
    console.log(`[sendModuleCompleteEmail] Module ${moduleNumber} email already sent, skipping (idempotent)`);
    return;
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return;

  const resend = new Resend(resendApiKey);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const appUrl = supabaseUrl.replace('.supabase.co', '.lovable.app');

  // Use client-side module download page for on-demand PDF generation
  // This is more reliable as it generates from the module's raw data
  const downloadUrl = `${appUrl}/download/module/${moduleId}`;

  try {
    await resend.emails.send({
      from: "OneDuo <hello@oneduo.ai>",
      to: [email],
      subject: `${courseTitle}, Module ${moduleNumber} OneDuo is ready for download!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #111111; border-radius: 16px; overflow: hidden;">
                  
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 24px; text-align: center;">
                      <p style="margin: 0; color: #00d4ff; font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">OneDuo</p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 0 40px 24px;">
                      <h2 style="margin: 0 0 16px; color: #ffffff; font-size: 24px; font-weight: 600; line-height: 1.3;">Module ${moduleNumber} Intel Distilled</h2>
                      <p style="margin: 0 0 16px; color: #cccccc; font-size: 15px; line-height: 1.7;">
                        <strong style="color: #ffffff;">${courseTitle}</strong> — Module ${moduleNumber} of ${totalModules} is now ready.
                      </p>
                      ${totalModules - moduleNumber > 0
          ? `<p style="margin: 0; color: #888888; font-size: 14px; line-height: 1.6;">The remaining ${totalModules - moduleNumber} module(s) are still processing. You can begin implementation with this module now while the others complete.</p>`
          : `<p style="margin: 0; color: #888888; font-size: 14px; line-height: 1.6;">All modules are now complete. Your entire course artifact is ready for AI-assisted execution.</p>`
        }
                    </td>
                  </tr>
                  
                  <!-- CTA Button -->
                  <tr>
                    <td style="padding: 0 40px 24px; text-align: center;">
                      <a href="${downloadUrl}" style="display: inline-block; background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%); color: #000000; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                        Access Module ${moduleNumber} →
                      </a>
                    </td>
                  </tr>
                  
                  <!-- Proprietary Notice (compact) -->
                  <tr>
                    <td style="padding: 0 40px 40px;">
                      <p style="margin: 0; color: #555555; font-size: 11px; line-height: 1.5; text-align: center;">
                        This artifact is proprietary intel for authorized use only. Not to be redistributed.
                      </p>
                    </td>
                  </tr>
                  
                </table>
                
                <!-- Subtle footer -->
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin-top: 24px;">
                  <tr>
                    <td style="text-align: center;">
                      <p style="margin: 0; color: #333333; font-size: 12px;">
                        — OneDuo
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log(`[sendModuleCompleteEmail] Module ${moduleNumber} email sent (idempotent)`);
  } catch (err) {
    console.error("[sendModuleCompleteEmail] Failed:", err);
    // Note: email_sent_at is already set, so we won't retry sending
    // This is intentional - we'd rather skip an email than send duplicates
  }
}

// Legacy function for backwards compatibility
async function sendModuleCompleteEmail(email: string, courseTitle: string, moduleNumber: number, totalModules: number, courseId: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return;

  const resend = new Resend(resendApiKey);
  const appUrl = Deno.env.get("APP_URL") || "https://oneduo.ai";
  const downloadUrl = `${appUrl}/download/${courseId}`;

  try {
    await resend.emails.send({
      from: "OneDuo <hello@oneduo.ai>",
      to: [email],
      subject: `${courseTitle}, Module ${moduleNumber} OneDuo is ready for download!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #111111; border-radius: 16px; overflow: hidden;">
                  
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 24px; text-align: center;">
                      <p style="margin: 0; color: #00d4ff; font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">OneDuo</p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 0 40px 24px;">
                      <h2 style="margin: 0 0 16px; color: #ffffff; font-size: 24px; font-weight: 600; line-height: 1.3;">Module ${moduleNumber} Intel Distilled</h2>
                      <p style="margin: 0 0 16px; color: #cccccc; font-size: 15px; line-height: 1.7;">
                        <strong style="color: #ffffff;">${courseTitle}</strong> — Module ${moduleNumber} of ${totalModules} is now ready.
                      </p>
                      <p style="margin: 0; color: #888888; font-size: 14px; line-height: 1.6;">The remaining ${totalModules - moduleNumber} module(s) are still processing. You can begin implementation with this module now.</p>
                    </td>
                  </tr>
                  
                  <!-- CTA Button -->
                  <tr>
                    <td style="padding: 0 40px 24px; text-align: center;">
                      <a href="${downloadUrl}" style="display: inline-block; background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%); color: #000000; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                        Access Module ${moduleNumber} →
                      </a>
                    </td>
                  </tr>
                  
                  <!-- Proprietary Notice (compact) -->
                  <tr>
                    <td style="padding: 0 40px 40px;">
                      <p style="margin: 0; color: #555555; font-size: 11px; line-height: 1.5; text-align: center;">
                        This artifact is proprietary intel for authorized use only. Not to be redistributed.
                      </p>
                    </td>
                  </tr>
                  
                </table>
                
                <!-- Subtle footer -->
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin-top: 24px;">
                  <tr>
                    <td style="text-align: center;">
                      <p style="margin: 0; color: #333333; font-size: 12px;">
                        — OneDuo
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log(`[sendModuleCompleteEmail] Module ${moduleNumber} email sent`);
  } catch (err) {
    console.error("[sendModuleCompleteEmail] Failed:", err);
  }
}

async function sendFailureEmail(email: string, courseTitle: string, courseId: string, errorMessage: string, errorAnalysis: ErrorAnalysis) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return;

  const resend = new Resend(resendApiKey);
  const appUrl = Deno.env.get("APP_URL") || "https://oneduo.ai";

  const canAutoFix = errorAnalysis.canAutoFix;
  const userAction = canAutoFix
    ? "You can retry from your dashboard and we'll try a different approach."
    : `Please ${errorAnalysis.fixStrategy.toLowerCase()} and retry.`;

  try {
    await resend.emails.send({
      from: "OneDuo <hello@oneduo.ai>",
      to: [email],
      subject: `⚠️ Issue with "${courseTitle}" - Action needed`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #ff6b6b;">Processing Issue</h1>
          <p>We encountered an issue while processing <strong>${courseTitle}</strong>.</p>
          <div style="background: #fff3f3; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <strong>What happened:</strong> ${errorAnalysis.type === 'unknown' ? errorMessage : `${errorAnalysis.type.replace('_', ' ')} error`}
          </div>
          <p>${userAction}</p>
          <a href="${appUrl}/dashboard" style="display: inline-block; background: #00d4ff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
            View Dashboard →
          </a>
        </div>
      `,
    });
    console.log("[sendFailureEmail] Failure notification sent");
  } catch (err) {
    console.error("[sendFailureEmail] Failed:", err);
  }
}
// Helper for Lazy Progress Updates
async function checkReplicateProgress(
  supabase: any, 
  id: string, 
  table: string, 
  predictionId: string, 
  apiKey: string,
  currentRecord: any
) {
  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!response.ok) return null;

    const prediction = await response.json();
    
    // Calculate progress
    let progress = currentRecord.progress;
    
    if (prediction.status === 'succeeded') {
      progress = 90; // Almost done, waiting for webhook to finalize
    } else if (prediction.status === 'processing') {
      // Estimate based on logs or generic time? 
      // Replicate logs often have "x%|...| n/m [time]"
      // For now, simple time-based increment or parsing logs if available
      if (prediction.logs) {
        // Try to find percentage in logs
        const match = prediction.logs.match(/(\d+)%/g);
        if (match && match.length > 0) {
          const lastPct = parseInt(match[match.length - 1].replace('%', ''));
          // Map 0-100 extraction to 25-90 overall progress
          progress = 25 + Math.floor((lastPct / 100) * 65);
        } else {
           // Fallback: Increment by 1-5% per check up to 85%
           progress = Math.min(85, (currentRecord.progress || 25) + 2);
        }
      } else {
        progress = Math.min(85, (currentRecord.progress || 25) + 1);
      }
    } else if (prediction.status === 'starting') {
      progress = 25;
    }

    // Update DB
    const updatePayload: any = { 
      progress,
    };
    
    if (table === 'courses') {
      updatePayload.last_heartbeat_at = new Date().toISOString();
    } else {
      updatePayload.heartbeat_at = new Date().toISOString();
    }

    await supabase.from(table).update(updatePayload).eq("id", id);
    
    return { id, table, progress };
  } catch (e) {
    console.warn(`[checkReplicateProgress] Failed for ${id}:`, e);
    return null;
  }
}
