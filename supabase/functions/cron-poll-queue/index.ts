import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { recoverStalledJobs, recordMetric } from '../_shared/job-runner.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Worker ID for this cron instance
const WORKER_ID = `cron-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

// Visibility timeout in seconds - 30 minutes for very long videos (5-8+ hours)
// The visibility extender in process-course refreshes every 5 min, so this is just initial buffer
const VISIBILITY_TIMEOUT_SECONDS = 1800;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the cron secret from header
    const cronSecret = req.headers.get('x-cron-secret');
    
    // Get expected secret from environment
    const envSecret = Deno.env.get('CRON_SECRET');
    
    // Create service role client for validation and operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });
    
    // Validate secret - check env var first, then fallback to database
    let isValid = false;
    
    if (envSecret && cronSecret === envSecret) {
      isValid = true;
    } else {
      // Fallback: check system_settings table
      const { data: dbSecret } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'cron_poll_secret')
        .single();
      
      if (dbSecret?.value && cronSecret === dbSecret.value.replace(/^"|"$/g, '')) {
        isValid = true;
      }
    }
    
    if (!isValid) {
      console.warn('Invalid or missing cron secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[cron-poll] Started at ${new Date().toISOString()}, worker: ${WORKER_ID}`);

    // ============ PHASE 1: CLAIM JOBS ATOMICALLY ============
    // Use the new claim_processing_job function for atomic job claiming
    // This prevents race conditions and ensures visibility timeout
    
    const results: Array<{ jobId: string; courseId: string; step: string; status: string }> = [];
    let claimedCount = 0;
    const MAX_JOBS_PER_POLL = 5;

    for (let i = 0; i < MAX_JOBS_PER_POLL; i++) {
      // Atomically claim a job with retry for constraint violations
      let claimedJob = null;
      let claimError = null;
      
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await supabase.rpc('claim_processing_job', {
          p_worker_id: WORKER_ID,
          p_visibility_seconds: VISIBILITY_TIMEOUT_SECONDS
        });
        
        if (result.error) {
          claimError = result.error;
          // Check if it's a constraint violation (duplicate key) - this is expected in high concurrency
          const isDuplicateKey = result.error.code === '23505' || 
                                  result.error.message?.includes('duplicate key') ||
                                  result.error.message?.includes('unique constraint');
          
          if (isDuplicateKey) {
            console.log(`[cron-poll] Constraint violation on attempt ${attempt + 1}, retrying...`);
            await new Promise(r => setTimeout(r, 100 * (attempt + 1))); // Brief backoff
            continue;
          }
          
          // Non-retryable error
          console.error('[cron-poll] Error claiming job:', result.error);
          break;
        }
        
        claimedJob = result.data;
        claimError = null;
        break;
      }

      if (claimError) {
        console.error('[cron-poll] Failed to claim job after retries:', claimError);
        break;
      }

      // No more jobs to claim
      if (!claimedJob || claimedJob.length === 0) {
        console.log(`[cron-poll] No more pending jobs to claim after ${claimedCount} claims`);
        break;
      }

      const job = claimedJob[0];
      claimedCount++;
      console.log(`[cron-poll] Claimed job ${job.job_id} (step: ${job.step}, course: ${job.course_id}, attempt: ${job.attempt_count})`);

      // ============ PHASE 2: DISPATCH TO PROCESS-COURSE ============
      // CRITICAL: Do NOT mark as completed here!
      // Let process-course handle the actual work and completion
      
      try {
        // Call process-course with the specific job info
        // Use a background fetch so we don't block on long-running jobs
        const processPromise = fetch(`${supabaseUrl}/functions/v1/process-course`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ 
            action: 'process-job',
            jobId: job.job_id,
            courseId: job.course_id,
            step: job.step,
            metadata: job.metadata,
            workerId: WORKER_ID
          })
        });

        // Don't await the full response - let it run in background
        // The visibility timeout will protect against hung jobs
        processPromise.then(async (response) => {
          if (response.ok) {
            console.log(`[cron-poll] Job ${job.job_id} dispatched successfully`);
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[cron-poll] Job ${job.job_id} dispatch failed: ${errorText}`);
            
            // Fail the job so it can be retried
            await supabase.rpc('fail_processing_job', {
              p_job_id: job.job_id,
              p_worker_id: WORKER_ID,
              p_error_message: `Dispatch failed: ${errorText}`,
              p_should_retry: true
            });
          }
        }).catch(async (err) => {
          console.error(`[cron-poll] Job ${job.job_id} dispatch exception:`, err);
          await supabase.rpc('fail_processing_job', {
            p_job_id: job.job_id,
            p_worker_id: WORKER_ID,
            p_error_message: `Dispatch exception: ${err.message}`,
            p_should_retry: true
          });
        });

        results.push({ 
          jobId: job.job_id, 
          courseId: job.course_id, 
          step: job.step,
          status: 'dispatched' 
        });

      } catch (dispatchError) {
        console.error(`[cron-poll] Exception dispatching job ${job.job_id}:`, dispatchError);
        
        // Release the job for retry
        await supabase.rpc('fail_processing_job', {
          p_job_id: job.job_id,
          p_worker_id: WORKER_ID,
          p_error_message: `Cron dispatch error: ${dispatchError instanceof Error ? dispatchError.message : 'Unknown'}`,
          p_should_retry: true
        });
        
        results.push({ 
          jobId: job.job_id, 
          courseId: job.course_id, 
          step: job.step,
          status: 'dispatch_failed' 
        });
      }
    }

    // ============ PHASE 3: RECOVER EXPIRED VISIBILITY TIMEOUTS ============
    const { data: expiredJobs } = await supabase
      .from('processing_queue')
      .select('id, course_id, step, claimed_by, attempt_count')
      .eq('status', 'processing')
      .lt('visibility_timeout', new Date().toISOString())
      .eq('purged', false)
      .limit(5);

    if (expiredJobs && expiredJobs.length > 0) {
      console.log(`[cron-poll] Found ${expiredJobs.length} jobs with expired visibility timeouts`);
      
      for (const expiredJob of expiredJobs) {
        const attemptCount = (expiredJob.attempt_count || 0) + 1;
        const maxAttempts = 5;
        
        if (attemptCount >= maxAttempts) {
          // Max retries exceeded - trigger manual review notification
          console.log(`[cron-poll] Job ${expiredJob.id} exceeded max attempts, triggering manual review`);
          
          try {
            await supabase.functions.invoke('notify-processing-failure', {
              body: {
                courseId: expiredJob.course_id,
                step: expiredJob.step,
                errorMessage: `Job failed after ${maxAttempts} visibility timeout expirations`,
                attemptCount: maxAttempts,
                source: 'cron-poll-queue'
              }
            });
          } catch (notifyErr) {
            console.error(`[cron-poll] Failed to notify:`, notifyErr);
            // Fallback: still mark as manual_review
            await supabase.from('courses').update({
              status: 'manual_review',
              error_message: null,
              progress_step: 'manual_review',
            }).eq('id', expiredJob.course_id);
          }
          
          await supabase
            .from('processing_queue')
            .update({
              status: 'failed',
              visibility_timeout: null,
              claimed_by: null,
              error_message: `Moved to manual review after ${maxAttempts} attempts`
            })
            .eq('id', expiredJob.id);
          
          results.push({
            jobId: expiredJob.id,
            courseId: expiredJob.course_id,
            step: expiredJob.step,
            status: 'moved_to_manual_review'
          });
        } else {
          // Reset for retry
          const { error: resetError } = await supabase
            .from('processing_queue')
            .update({
              status: 'pending',
              started_at: null,
              visibility_timeout: null,
              claimed_by: null,
              attempt_count: attemptCount,
              error_message: `Visibility timeout expired (worker ${expiredJob.claimed_by} died), attempt ${attemptCount}`
            })
            .eq('id', expiredJob.id);

          if (!resetError) {
            console.log(`[cron-poll] Reset expired job ${expiredJob.id} to pending (attempt ${attemptCount})`);
            results.push({
              jobId: expiredJob.id,
              courseId: expiredJob.course_id,
              step: expiredJob.step,
              status: 'reset_from_expired'
            });
          }
        }
      }
    }

    // ============ PHASE 4: RECOVER STALLED JOBS (>30 min with no heartbeat) ============
    const { recovered, failed: stalledFailed } = await recoverStalledJobs(supabase, 30);
    if (recovered > 0 || stalledFailed > 0) {
      console.log(`[cron-poll] Stalled job recovery: ${recovered} recovered, ${stalledFailed} failed`);
    }

    // ============ PHASE 5: RECORD METRICS ============
    await recordMetric(supabase, 'cron_poll_jobs_claimed', claimedCount, { worker: WORKER_ID });
    await recordMetric(supabase, 'cron_poll_expired_reset', expiredJobs?.length || 0);
    await recordMetric(supabase, 'cron_poll_stalled_recovered', recovered);

    console.log(`[cron-poll] Complete: ${claimedCount} jobs claimed and dispatched`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        workerId: WORKER_ID,
        jobsClaimed: claimedCount,
        expiredJobsReset: expiredJobs?.length || 0,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron-poll] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
