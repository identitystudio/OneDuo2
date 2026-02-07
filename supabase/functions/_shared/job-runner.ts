/**
 * Production-Grade Job Runner
 * 
 * Wraps any edge function with Stripe/Zapier-style reliability:
 * - Automatic retries with exponential backoff
 * - Output verification gates
 * - Centralized logging to job_logs
 * - Loud failures (never silent skips)
 * - Idempotency checks
 */

// Use 'any' for SupabaseClient to avoid type conflicts between different versions
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// ============ TYPES ============

export interface JobConfig {
  jobId: string;
  courseId: string;
  step: string;
  workerId?: string;
  queueJobId?: string;
  moduleId?: string;
}

export interface JobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  critical: boolean;
  expected?: unknown;
  actual?: unknown;
}

// ============ LOGGING ============

const LOG_LEVELS = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  critical: console.error,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Centralized job logging - always logs to both console AND database
 */
export async function logJob(
  supabase: SupabaseClient,
  config: JobConfig,
  level: LogLevel,
  step: string,
  message: string,
  metadata?: Record<string, unknown>,
  errorDetails?: { reason?: string; stack?: string }
): Promise<void> {
  const timestamp = new Date().toISOString();
  const prefix = `[${config.jobId}][${step}]`;
  
  // ALWAYS log to console first (immediate visibility)
  LOG_LEVELS[level](`${prefix} ${message}`, metadata ? JSON.stringify(metadata) : '');
  
  // Then persist to database
  try {
    await supabase.from('job_logs').insert({
      job_id: config.jobId,
      step,
      level,
      message,
      error_reason: errorDetails?.reason || null,
      error_stack: errorDetails?.stack || null,
      metadata: {
        ...metadata,
        course_id: config.courseId,
        module_id: config.moduleId,
        worker_id: config.workerId,
        queue_job_id: config.queueJobId,
        timestamp,
      },
    });
  } catch (e) {
    // LOUD FAILURE: Never silently skip logging
    console.error(`[RELIABILITY] LOGGING FAILED for ${config.jobId}:`, e);
  }
}

// ============ IDEMPOTENCY ============

/**
 * Check if a step has already been completed (safe to re-run)
 */
export async function isStepCompleted(
  supabase: SupabaseClient,
  config: JobConfig,
  stepKey: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('job_logs')
      .select('id')
      .eq('job_id', config.jobId)
      .eq('step', `${stepKey}_completed`)
      .eq('level', 'info')
      .limit(1)
      .maybeSingle();
    
    if (data) {
      console.log(`[IDEMPOTENT] Step ${stepKey} already completed for ${config.jobId}`);
      return true;
    }
    return false;
  } catch {
    return false; // Safe side: assume not complete
  }
}

/**
 * Mark a step as completed (idempotency marker)
 */
export async function markStepCompleted(
  supabase: SupabaseClient,
  config: JobConfig,
  stepKey: string,
  result?: Record<string, unknown>
): Promise<void> {
  await logJob(supabase, config, 'info', `${stepKey}_completed`, 
    `Step ${stepKey} completed successfully`, result);
}

// ============ OUTPUT VERIFICATION ============

/**
 * Run verification checks before allowing job completion
 */
export function createVerifier() {
  const checks: VerificationCheck[] = [];
  
  return {
    check(name: string, passed: boolean, critical: boolean, expected?: unknown, actual?: unknown) {
      checks.push({ name, passed, critical, expected, actual });
    },
    
    verify(): { passed: boolean; failedCritical: string[]; checks: VerificationCheck[] } {
      const failedCritical = checks.filter(c => c.critical && !c.passed).map(c => c.name);
      return {
        passed: failedCritical.length === 0,
        failedCritical,
        checks,
      };
    }
  };
}

/**
 * Verify course has required outputs before marking complete
 */
export async function verifyCourseOutputs(
  supabase: SupabaseClient,
  courseId: string
): Promise<{ passed: boolean; failedCritical: string[]; details: Record<string, unknown> }> {
  const verifier = createVerifier();
  
  const { data: course } = await supabase
    .from('courses')
    .select('frame_urls, transcript, status, total_frames')
    .eq('id', courseId)
    .single();
  
  if (!course) {
    return { passed: false, failedCritical: ['course_not_found'], details: {} };
  }
  
  const frameCount = Array.isArray(course.frame_urls) ? course.frame_urls.length : 0;
  
  // CRITICAL: Must have frames
  verifier.check('has_frames', frameCount > 0, true, '>0', frameCount);
  
  // CRITICAL: If total_frames set, must have at least 80%
  if (course.total_frames && course.total_frames > 0) {
    const threshold = course.total_frames * 0.8;
    verifier.check('frame_count_valid', frameCount >= threshold, true, `>=${threshold}`, frameCount);
  }
  
  // WARNING: Should have transcript (not critical for frames-only mode)
  const hasTranscript = course.transcript && 
    (Array.isArray(course.transcript) ? course.transcript.length > 0 : true);
  verifier.check('has_transcript', hasTranscript, false);
  
  const result = verifier.verify();
  return {
    passed: result.passed,
    failedCritical: result.failedCritical,
    details: {
      frame_count: frameCount,
      total_frames: course.total_frames,
      has_transcript: hasTranscript,
      checks: result.checks,
    }
  };
}

// ============ RETRY LOGIC ============

const RETRYABLE_ERRORS = [
  'timeout', 'network', '503', '504', '429', 
  'rate limit', 'connection', 'ECONNRESET', 'ETIMEDOUT',
  'fetch failed', 'socket hang up'
];

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error | string): boolean {
  const msg = (typeof error === 'string' ? error : error.message).toLowerCase();
  return RETRYABLE_ERRORS.some(r => msg.includes(r.toLowerCase()));
}

/**
 * Execute with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    supabase?: SupabaseClient;
    config?: JobConfig;
    stepName?: string;
  } = {}
): Promise<T> {
  const { 
    maxAttempts = 3, 
    baseDelayMs = 1000, 
    maxDelayMs = 30000,
    supabase,
    config,
    stepName = 'retry_operation'
  } = options;
  
  let lastError: Error = new Error('Unknown error');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const retryable = isRetryableError(lastError);
      
      if (attempt < maxAttempts && retryable) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        
        if (supabase && config) {
          await logJob(supabase, config, 'warn', stepName,
            `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`,
            { attempt, delay, retryable }, { reason: lastError.message });
        } else {
          console.warn(`[RETRY] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${lastError.message}`);
        }
        
        await new Promise(r => setTimeout(r, delay));
      } else if (!retryable) {
        // Non-retryable - fail immediately
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

// ============ JOB COMPLETION ============

/**
 * Complete a job with verification gates
 * BLOCKS completion if verification fails
 */
export async function completeJobWithVerification(
  supabase: SupabaseClient,
  config: JobConfig,
  verification: { passed: boolean; failedCritical: string[]; details?: Record<string, unknown> }
): Promise<{ success: boolean; reason?: string }> {
  
  if (!verification.passed) {
    // LOUD FAILURE: Block completion
    await logJob(supabase, config, 'critical', 'completion_blocked',
      `JOB BLOCKED: Failed critical checks: ${verification.failedCritical.join(', ')}`,
      { failedChecks: verification.failedCritical, ...verification.details });
    
    // Record constraint violation
    try {
      await supabase.from('constraint_violations').insert({
        entity_type: 'processing_job',
        entity_id: config.queueJobId || config.jobId,
        constraint_name: 'output_verification_failed',
        violation_type: 'data_integrity',
        expected_state: { verified: true },
        actual_state: { verified: false, failed_checks: verification.failedCritical },
        severity: 'critical',
      });
    } catch { /* ignore */ }
    
    return { 
      success: false, 
      reason: `Verification failed: ${verification.failedCritical.join(', ')}` 
    };
  }
  
  // Mark job completed
  if (config.queueJobId) {
    const { error } = await supabase.from('processing_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', config.queueJobId);
    
    if (error) {
      await logJob(supabase, config, 'error', 'completion_db_error',
        `Failed to mark job complete: ${error.message}`, {}, { reason: error.message });
      return { success: false, reason: error.message };
    }
  }
  
  await logJob(supabase, config, 'info', 'job_completed',
    'Job completed successfully', verification.details);
  
  return { success: true };
}

/**
 * Fail a job LOUDLY (never silent)
 */
export async function failJobLoudly(
  supabase: SupabaseClient,
  config: JobConfig,
  errorMessage: string,
  shouldRetry = true
): Promise<void> {
  // LOUD: Always console.error
  console.error(`[FAILURE][${config.jobId}] ${errorMessage}`);
  
  await logJob(supabase, config, 'error', 'job_failed', errorMessage,
    { shouldRetry }, { reason: errorMessage });
  
  if (!config.queueJobId) return;
  
  // Get current attempt count
  const { data: job } = await supabase
    .from('processing_queue')
    .select('attempt_count')
    .eq('id', config.queueJobId)
    .single();
  
  const attempts = (job?.attempt_count || 0) + 1;
  const maxAttempts = 5;
  
  if (shouldRetry && attempts < maxAttempts) {
    // Requeue for retry
    await supabase.from('processing_queue')
      .update({
        status: 'pending',
        started_at: null,
        visibility_timeout: null,
        claimed_by: null,
        attempt_count: attempts,
        error_message: `Retry ${attempts}/${maxAttempts}: ${errorMessage}`,
      })
      .eq('id', config.queueJobId);
    
    await logJob(supabase, config, 'warn', 'job_requeued',
      `Requeued for retry (attempt ${attempts}/${maxAttempts})`, { attempts, maxAttempts });
  } else {
    // Terminal failure
    await supabase.from('processing_queue')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `TERMINAL: ${errorMessage} (after ${maxAttempts} attempts)`,
      })
      .eq('id', config.queueJobId);
    
    await logJob(supabase, config, 'critical', 'job_terminal_failure',
      `Job failed permanently after ${maxAttempts} attempts`, { attempts: maxAttempts });
  }
}

// ============ HEALTH MONITORING ============

/**
 * Record a metric for monitoring
 */
export async function recordMetric(
  supabase: SupabaseClient,
  name: string,
  value: number,
  tags?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.rpc('record_metric', {
      p_name: name,
      p_value: value,
      p_tags: tags || {}
    });
  } catch {
    // Ignore metric errors
  }
}

/**
 * Check for stuck jobs and recover
 */
export async function recoverStalledJobs(
  supabase: SupabaseClient,
  stalledThresholdMinutes = 30
): Promise<{ recovered: number; failed: number }> {
  const threshold = new Date(Date.now() - stalledThresholdMinutes * 60 * 1000).toISOString();
  
  const { data: stalledJobs } = await supabase
    .from('processing_queue')
    .select('id, course_id, step, attempt_count, started_at')
    .eq('status', 'processing')
    .eq('purged', false)
    .lt('started_at', threshold)
    .limit(10);
  
  if (!stalledJobs?.length) return { recovered: 0, failed: 0 };
  
  let recovered = 0;
  let failed = 0;
  
  for (const job of stalledJobs) {
    // Check if course has data (frames exist = should recover, not fail)
    const { data: course } = await supabase
      .from('courses')
      .select('frame_urls')
      .eq('id', job.course_id)
      .single();
    
    const hasFrames = Array.isArray(course?.frame_urls) && course.frame_urls.length > 0;
    
    if (hasFrames) {
      // Has data - reset to pending
      await supabase.from('processing_queue')
        .update({
          status: 'pending',
          started_at: null,
          visibility_timeout: null,
          claimed_by: null,
          error_message: 'Auto-recovered by stalled job detector (data exists)'
        })
        .eq('id', job.id);
      recovered++;
    } else if ((job.attempt_count || 0) >= 5) {
      // No data + max attempts
      await supabase.from('processing_queue')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'Stalled and max retries exceeded'
        })
        .eq('id', job.id);
      failed++;
    } else {
      // Reset for retry
      await supabase.from('processing_queue')
        .update({
          status: 'pending',
          started_at: null,
          visibility_timeout: null,
          claimed_by: null,
          attempt_count: (job.attempt_count || 0) + 1,
          error_message: 'Auto-recovered by stalled job detector'
        })
        .eq('id', job.id);
      recovered++;
    }
  }
  
  return { recovered, failed };
}
