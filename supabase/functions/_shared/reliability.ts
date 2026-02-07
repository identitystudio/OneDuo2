/**
 * Production Reliability Infrastructure
 * 
 * Stripe/Zapier-grade patterns for async job processing:
 * - Idempotent operations
 * - Output verification before completion
 * - Automatic retries with exponential backoff
 * - Centralized logging
 * - Loud failures (never silent skips)
 * - Integrity gates
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ============ TYPES ============

export interface JobContext {
  jobId: string;
  courseId: string;
  step: string;
  workerId: string;
  startedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface JobLogEntry {
  step: string;
  level: 'info' | 'warn' | 'error' | 'critical';
  message: string;
  errorReason?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

export interface OutputVerification {
  verified: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
    critical: boolean;
  }>;
  failedCritical: string[];
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
}

export interface IntegrityGate {
  name: string;
  check: () => Promise<boolean>;
  failureMessage: string;
  severity: 'warn' | 'error' | 'critical';
}

// ============ DEFAULT CONFIGS ============

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: [
    'timeout', 'network', '503', '504', '429', 
    'rate limit', 'connection', 'ECONNRESET'
  ],
};

// Step-specific SLA durations (in seconds)
export const STEP_SLA_SECONDS: Record<string, number> = {
  'transcribe': 600,
  'transcribe_and_extract': 1200,
  'extract_frames': 1800,
  'render_gifs': 1200,
  'analyze_audio': 300,
  'train_ai': 300,
  'build_pdf': 300,
  'transcribe_module': 600,
  'transcribe_and_extract_module': 1200,
  'extract_frames_module': 1800,
  'analyze_audio_module': 300,
  'train_ai_module': 300,
  'default': 1200,
};

// ============ CENTRALIZED LOGGING ============

/**
 * Log a job event with full context to job_logs table.
 * NEVER silently fails - always logs to console if DB write fails.
 */
export async function logJobEvent(
  supabase: SupabaseClient,
  ctx: JobContext,
  entry: JobLogEntry
): Promise<void> {
  const timestamp = new Date().toISOString();
  const fullEntry = {
    job_id: ctx.jobId,
    step: entry.step,
    level: entry.level,
    message: entry.message,
    error_reason: entry.errorReason || null,
    error_stack: entry.errorStack || null,
    metadata: {
      ...entry.metadata,
      course_id: ctx.courseId,
      worker_id: ctx.workerId,
      timestamp,
      duration_ms: entry.durationMs,
    },
  };

  try {
    const { error } = await supabase.from('job_logs').insert(fullEntry);
    if (error) {
      // LOUD FAILURE: Never silently skip logging
      console.error(`[RELIABILITY] LOGGING FAILED for ${ctx.jobId}:`, error.message);
      console.error('[RELIABILITY] Original log entry:', JSON.stringify(fullEntry));
    }
  } catch (e) {
    console.error(`[RELIABILITY] LOGGING EXCEPTION for ${ctx.jobId}:`, e);
    console.error('[RELIABILITY] Original log entry:', JSON.stringify(fullEntry));
  }

  // Always log to console for observability
  const logFn = entry.level === 'error' || entry.level === 'critical' 
    ? console.error 
    : entry.level === 'warn' 
      ? console.warn 
      : console.log;
  
  logFn(`[${ctx.jobId}] [${entry.step}] ${entry.message}`);
}

/**
 * Create a job context from minimal info
 */
export function createJobContext(
  courseId: string,
  step: string,
  jobId?: string,
  workerId?: string
): JobContext {
  return {
    jobId: jobId || `job-${courseId.slice(0, 8)}-${step}`,
    courseId,
    step,
    workerId: workerId || `worker-${crypto.randomUUID().slice(0, 8)}`,
    startedAt: new Date(),
  };
}

// ============ IDEMPOTENCY ============

/**
 * Check if an operation has already been completed (idempotency guard)
 * Returns true if operation should be SKIPPED (already done)
 */
export async function isOperationComplete(
  supabase: SupabaseClient,
  ctx: JobContext,
  operationKey: string
): Promise<boolean> {
  try {
    // Check job_logs for a completion marker
    const { data } = await supabase
      .from('job_logs')
      .select('id')
      .eq('job_id', ctx.jobId)
      .eq('step', `${operationKey}_completed`)
      .eq('level', 'info')
      .limit(1)
      .maybeSingle();
    
    if (data) {
      console.log(`[IDEMPOTENT] Skipping ${operationKey} for ${ctx.jobId} - already completed`);
      return true;
    }
    return false;
  } catch (e) {
    // On error, assume not complete (safe side)
    console.warn(`[IDEMPOTENT] Check failed for ${operationKey}:`, e);
    return false;
  }
}

/**
 * Mark an operation as complete (idempotency marker)
 */
export async function markOperationComplete(
  supabase: SupabaseClient,
  ctx: JobContext,
  operationKey: string,
  result?: Record<string, unknown>
): Promise<void> {
  await logJobEvent(supabase, ctx, {
    step: `${operationKey}_completed`,
    level: 'info',
    message: `Operation ${operationKey} completed successfully`,
    metadata: result,
  });
}

// ============ OUTPUT VERIFICATION ============

/**
 * Verify outputs before marking a job complete.
 * CRITICAL: Jobs MUST NOT complete without passing verification.
 */
export function createOutputVerifier(): {
  addCheck: (name: string, passed: boolean, critical: boolean, expected?: unknown, actual?: unknown) => void;
  verify: () => OutputVerification;
} {
  const checks: OutputVerification['checks'] = [];

  return {
    addCheck(name: string, passed: boolean, critical: boolean, expected?: unknown, actual?: unknown) {
      checks.push({ name, passed, expected, actual, critical });
    },
    verify(): OutputVerification {
      const failedCritical = checks
        .filter(c => c.critical && !c.passed)
        .map(c => c.name);
      
      return {
        verified: failedCritical.length === 0,
        checks,
        failedCritical,
      };
    },
  };
}

/**
 * Standard output checks for course completion
 */
export async function verifyCourseOutputs(
  supabase: SupabaseClient,
  courseId: string
): Promise<OutputVerification> {
  const verifier = createOutputVerifier();

  const { data: course } = await supabase
    .from('courses')
    .select('frame_urls, transcript, status, total_frames')
    .eq('id', courseId)
    .single();

  if (!course) {
    verifier.addCheck('course_exists', false, true, 'exists', 'not found');
    return verifier.verify();
  }

  // Critical: Must have frames
  const hasFrames = Array.isArray(course.frame_urls) && course.frame_urls.length > 0;
  verifier.addCheck(
    'has_frames',
    hasFrames,
    true,
    '>0 frames',
    `${course.frame_urls?.length || 0} frames`
  );

  // Critical: Frame count matches expected
  if (course.total_frames && course.total_frames > 0) {
    const frameCount = course.frame_urls?.length || 0;
    const hasEnoughFrames = frameCount >= course.total_frames * 0.8; // 80% tolerance
    verifier.addCheck(
      'frame_count_valid',
      hasEnoughFrames,
      true,
      `>=${course.total_frames * 0.8} frames`,
      `${frameCount} frames`
    );
  }

  // Warning: Should have transcript (but not critical)
  const hasTranscript = course.transcript && 
    (Array.isArray(course.transcript) ? course.transcript.length > 0 : true);
  verifier.addCheck(
    'has_transcript',
    hasTranscript,
    false, // Not critical - frames-only mode is valid
    'transcript present',
    hasTranscript ? 'present' : 'missing'
  );

  return verifier.verify();
}

// ============ RETRY WITH BACKOFF ============

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  ctx?: JobContext,
  supabase?: SupabaseClient
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const errorMsg = lastError.message.toLowerCase();

      // Check if error is retryable
      const isRetryable = cfg.retryableErrors.some(r => errorMsg.includes(r.toLowerCase()));

      if (attempt < cfg.maxAttempts && isRetryable) {
        const delay = Math.min(cfg.baseDelayMs * Math.pow(2, attempt - 1), cfg.maxDelayMs);
        
        // Log retry attempt
        if (ctx && supabase) {
          await logJobEvent(supabase, ctx, {
            step: 'retry_attempt',
            level: 'warn',
            message: `Attempt ${attempt}/${cfg.maxAttempts} failed, retrying in ${delay}ms`,
            errorReason: lastError.message,
            metadata: { attempt, delay, isRetryable },
          });
        } else {
          console.warn(`[RETRY] Attempt ${attempt}/${cfg.maxAttempts} failed, retrying in ${delay}ms: ${lastError.message}`);
        }

        await new Promise(r => setTimeout(r, delay));
      } else if (!isRetryable) {
        // Non-retryable error - fail immediately
        if (ctx && supabase) {
          await logJobEvent(supabase, ctx, {
            step: 'non_retryable_error',
            level: 'error',
            message: `Non-retryable error: ${lastError.message}`,
            errorReason: lastError.message,
            metadata: { attempt, isRetryable: false },
          });
        }
        throw lastError;
      }
    }
  }

  // All retries exhausted
  if (ctx && supabase) {
    await logJobEvent(supabase, ctx, {
      step: 'retries_exhausted',
      level: 'error',
      message: `All ${cfg.maxAttempts} retry attempts exhausted`,
      errorReason: lastError.message,
    });
  }

  throw lastError;
}

// ============ INTEGRITY GATES ============

/**
 * Run integrity gates before job completion.
 * If any CRITICAL gate fails, completion is BLOCKED.
 */
export async function runIntegrityGates(
  supabase: SupabaseClient,
  ctx: JobContext,
  gates: IntegrityGate[]
): Promise<{ passed: boolean; failures: string[] }> {
  const failures: string[] = [];

  for (const gate of gates) {
    try {
      const passed = await gate.check();
      if (!passed) {
        failures.push(gate.failureMessage);
        
        await logJobEvent(supabase, ctx, {
          step: 'integrity_gate_failed',
          level: gate.severity === 'critical' ? 'critical' : gate.severity,
          message: `Integrity gate '${gate.name}' failed: ${gate.failureMessage}`,
          metadata: { gateName: gate.name, severity: gate.severity },
        });

        // Critical failures block completion
        if (gate.severity === 'critical') {
          return { passed: false, failures };
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      failures.push(`Gate '${gate.name}' threw: ${errorMsg}`);
      
      await logJobEvent(supabase, ctx, {
        step: 'integrity_gate_exception',
        level: 'error',
        message: `Integrity gate '${gate.name}' threw exception`,
        errorReason: errorMsg,
      });

      // Treat exceptions as critical failures
      if (gate.severity === 'critical') {
        return { passed: false, failures };
      }
    }
  }

  return { passed: true, failures };
}

// ============ JOB LIFECYCLE ============

/**
 * Standard job completion flow with all verification steps
 */
export async function completeJobWithVerification(
  supabase: SupabaseClient,
  ctx: JobContext,
  queueJobId: string,
  outputVerification: OutputVerification
): Promise<{ success: boolean; reason?: string }> {
  // CRITICAL: Block completion if verification failed
  if (!outputVerification.verified) {
    await logJobEvent(supabase, ctx, {
      step: 'completion_blocked',
      level: 'critical',
      message: `JOB COMPLETION BLOCKED: Failed critical checks: ${outputVerification.failedCritical.join(', ')}`,
      metadata: { 
        failedChecks: outputVerification.failedCritical,
        allChecks: outputVerification.checks,
      },
    });

    // Log to constraint_violations for ops visibility
    try {
      await supabase.from('constraint_violations').insert({
        entity_type: 'processing_job',
        entity_id: queueJobId,
        constraint_name: 'output_verification_failed',
        violation_type: 'data_integrity',
        expected_state: { verified: true },
        actual_state: { 
          verified: false, 
          failed_checks: outputVerification.failedCritical 
        },
        severity: 'critical',
      });
    } catch {
      // Ignore logging errors
    }

    return { 
      success: false, 
      reason: `Output verification failed: ${outputVerification.failedCritical.join(', ')}` 
    };
  }

  // Log any non-critical warnings
  const warnings = outputVerification.checks
    .filter(c => !c.passed && !c.critical)
    .map(c => c.name);
  
  if (warnings.length > 0) {
    await logJobEvent(supabase, ctx, {
      step: 'completion_with_warnings',
      level: 'warn',
      message: `Job completing with warnings: ${warnings.join(', ')}`,
      metadata: { warnings },
    });
  }

  // Mark job as completed
  const { error } = await supabase.from('processing_queue')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', queueJobId);

  if (error) {
    await logJobEvent(supabase, ctx, {
      step: 'completion_db_error',
      level: 'error',
      message: `Failed to mark job as completed: ${error.message}`,
      errorReason: error.message,
    });
    return { success: false, reason: error.message };
  }

  const duration = Date.now() - ctx.startedAt.getTime();
  await logJobEvent(supabase, ctx, {
    step: 'job_completed',
    level: 'info',
    message: `Job completed successfully`,
    durationMs: duration,
    metadata: { 
      queueJobId,
      checksRun: outputVerification.checks.length,
      checksPassed: outputVerification.checks.filter(c => c.passed).length,
    },
  });

  return { success: true };
}

/**
 * Fail a job with full logging and optional retry scheduling
 */
export async function failJobLoudly(
  supabase: SupabaseClient,
  ctx: JobContext,
  queueJobId: string,
  errorMessage: string,
  shouldRetry: boolean = true
): Promise<void> {
  // LOUD FAILURE: Never silent
  console.error(`[FAILURE] [${ctx.jobId}] ${errorMessage}`);

  await logJobEvent(supabase, ctx, {
    step: 'job_failed',
    level: 'error',
    message: errorMessage,
    errorReason: errorMessage,
    durationMs: Date.now() - ctx.startedAt.getTime(),
  });

  if (shouldRetry) {
    // Get current attempt count
    const { data: job } = await supabase
      .from('processing_queue')
      .select('attempt_count')
      .eq('id', queueJobId)
      .single();

    const attempts = (job?.attempt_count || 0) + 1;
    const maxAttempts = 5;

    if (attempts < maxAttempts) {
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
        .eq('id', queueJobId);

      await logJobEvent(supabase, ctx, {
        step: 'job_requeued',
        level: 'warn',
        message: `Job requeued for retry (attempt ${attempts}/${maxAttempts})`,
        metadata: { attempts, maxAttempts },
      });
    } else {
      // Max retries - mark as permanently failed
      await supabase.from('processing_queue')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: `TERMINAL: ${errorMessage} (after ${maxAttempts} attempts)`,
        })
        .eq('id', queueJobId);

      await logJobEvent(supabase, ctx, {
        step: 'job_terminal_failure',
        level: 'critical',
        message: `Job failed permanently after ${maxAttempts} attempts`,
        metadata: { attempts: maxAttempts },
      });
    }
  } else {
    // Immediate failure (non-retryable)
    await supabase.from('processing_queue')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `NON-RETRYABLE: ${errorMessage}`,
      })
      .eq('id', queueJobId);
  }
}

// ============ BACKFILL / RECOVERY ============

/**
 * Detect and recover missing data for a course
 */
export async function detectAndRecoverMissingData(
  supabase: SupabaseClient,
  courseId: string
): Promise<{
  framesRecovered: boolean;
  transcriptRecovered: boolean;
  actions: string[];
}> {
  const actions: string[] = [];
  let framesRecovered = false;
  let transcriptRecovered = false;

  const { data: course } = await supabase
    .from('courses')
    .select('frame_urls, transcript, video_url, storage_path')
    .eq('id', courseId)
    .single();

  if (!course) {
    return { framesRecovered, transcriptRecovered, actions: ['course_not_found'] };
  }

  const hasFrames = Array.isArray(course.frame_urls) && course.frame_urls.length > 0;
  const hasTranscript = course.transcript && 
    (Array.isArray(course.transcript) ? course.transcript.length > 0 : true);

  // Check if we need to recover frames
  if (!hasFrames && (course.video_url || course.storage_path)) {
    actions.push('trigger_frame_extraction');
    
    // Trigger frame extraction via persist-frames
    try {
      const { data, error } = await supabase.functions.invoke('persist-frames', {
        body: { courseId, forceReExtract: true, maxFrames: 600 },
      });
      
      if (!error && data?.success) {
        framesRecovered = true;
        actions.push(`recovered_${data.persistedUrls?.length || 0}_frames`);
      }
    } catch (e) {
      actions.push(`frame_recovery_failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  // Transcript recovery is more complex - may need to trigger AssemblyAI
  if (!hasTranscript && course.video_url) {
    actions.push('transcript_missing_needs_manual_recovery');
  }

  return { framesRecovered, transcriptRecovered, actions };
}

// ============ HEALTH CHECK ============

/**
 * Check system health and report issues
 */
export async function checkSystemHealth(
  supabase: SupabaseClient
): Promise<{
  healthy: boolean;
  issues: Array<{ severity: string; message: string }>;
}> {
  const issues: Array<{ severity: string; message: string }> = [];

  // Check for stuck processing jobs (>30 min old)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stuckJobs } = await supabase
    .from('processing_queue')
    .select('id, step, started_at')
    .eq('status', 'processing')
    .lt('started_at', thirtyMinutesAgo)
    .limit(10);

  if (stuckJobs && stuckJobs.length > 0) {
    issues.push({
      severity: 'critical',
      message: `${stuckJobs.length} jobs stuck in processing for >30 minutes`,
    });
  }

  // Check for unprocessed constraint violations
  const { count: violationCount } = await supabase
    .from('constraint_violations')
    .select('id', { count: 'exact' })
    .eq('resolved', false)
    .eq('severity', 'critical')
    .limit(1);

  if (violationCount && violationCount > 0) {
    issues.push({
      severity: 'critical',
      message: `${violationCount} unresolved critical constraint violations`,
    });
  }

  // Check for dead letter queue items
  const { count: dlqCount } = await supabase
    .from('dead_letter_queue')
    .select('id', { count: 'exact' })
    .is('resolved_at', null)
    .limit(1);

  if (dlqCount && dlqCount > 0) {
    issues.push({
      severity: 'warn',
      message: `${dlqCount} items in dead letter queue`,
    });
  }

  return {
    healthy: !issues.some(i => i.severity === 'critical'),
    issues,
  };
}
