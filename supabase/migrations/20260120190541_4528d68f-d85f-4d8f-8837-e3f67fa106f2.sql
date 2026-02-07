-- Drop and recreate claim_processing_job to fix ambiguous column reference
DROP FUNCTION IF EXISTS public.claim_processing_job(text, integer);

CREATE FUNCTION public.claim_processing_job(
  p_worker_id text,
  p_visibility_seconds integer DEFAULT 300
)
RETURNS TABLE(job_id uuid, course_id uuid, step text, metadata jsonb, attempt_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_new_attempt_count integer;
BEGIN
  -- Find and lock a pending job atomically
  SELECT pq.* INTO v_job
  FROM processing_queue pq
  WHERE (
    -- Pending jobs ready to process
    (pq.status = 'pending' AND pq.purged = false)
    OR
    -- Jobs with expired visibility timeout (worker died)
    (pq.visibility_timeout IS NOT NULL AND pq.visibility_timeout < now() AND pq.status = 'processing')
  )
  ORDER BY pq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate new attempt count BEFORE the update to avoid ambiguity
  v_new_attempt_count := COALESCE(v_job.attempt_count, 0) + 1;
  
  -- Claim the job with visibility timeout
  -- Use explicit table alias to avoid column ambiguity
  UPDATE processing_queue
  SET 
    status = 'processing',
    claimed_by = p_worker_id,
    visibility_timeout = now() + (p_visibility_seconds || ' seconds')::interval,
    started_at = COALESCE(processing_queue.started_at, now()),
    attempt_count = v_new_attempt_count
  WHERE processing_queue.id = v_job.id;
  
  RETURN QUERY SELECT v_job.id, v_job.course_id, v_job.step, v_job.metadata, v_new_attempt_count;
END;
$$;