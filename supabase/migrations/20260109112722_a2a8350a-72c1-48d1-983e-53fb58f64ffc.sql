-- Video Processing Queue Table (BullMQ-equivalent)
CREATE TABLE IF NOT EXISTS public.video_processing_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_path TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE,
  user_id TEXT, -- session or user identifier
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT, -- worker ID that claimed this job
  locked_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for efficient job claiming
CREATE INDEX IF NOT EXISTS idx_video_queue_status_retry ON public.video_processing_queue (status, next_retry_at) WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_video_queue_locked ON public.video_processing_queue (locked_at) WHERE locked_by IS NOT NULL;

-- Enable RLS
ALTER TABLE public.video_processing_queue ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for workers)
CREATE POLICY "Service role has full access to video queue"
ON public.video_processing_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Function to atomically claim a job (prevents race conditions)
CREATE OR REPLACE FUNCTION public.claim_video_job(p_worker_id TEXT, p_lock_duration_seconds INTEGER DEFAULT 300)
RETURNS TABLE(
  job_id TEXT,
  video_path TEXT,
  user_id TEXT,
  attempt_count INTEGER,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- Find and lock a job atomically
  SELECT vpq.* INTO v_job
  FROM public.video_processing_queue vpq
  WHERE (
    -- Queued jobs ready to process
    (vpq.status = 'queued' AND (vpq.next_retry_at IS NULL OR vpq.next_retry_at <= now()))
    OR
    -- Failed jobs ready to retry
    (vpq.status = 'failed' AND vpq.attempt_count < vpq.max_attempts AND vpq.next_retry_at <= now())
    OR
    -- Stale locks (worker died)
    (vpq.locked_by IS NOT NULL AND vpq.locked_at < now() - (p_lock_duration_seconds || ' seconds')::interval)
  )
  ORDER BY vpq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Claim the job
  UPDATE public.video_processing_queue
  SET 
    status = 'processing',
    locked_by = p_worker_id,
    locked_at = now(),
    started_at = COALESCE(started_at, now()),
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = v_job.id;
  
  RETURN QUERY SELECT v_job.job_id, v_job.video_path, v_job.user_id, v_job.attempt_count + 1, v_job.metadata;
END;
$$;

-- Function to complete a job
CREATE OR REPLACE FUNCTION public.complete_video_job(p_job_id TEXT, p_success BOOLEAN, p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current RECORD;
  v_backoff_seconds INTEGER;
BEGIN
  SELECT * INTO v_current
  FROM public.video_processing_queue
  WHERE job_id = p_job_id;
  
  IF v_current.id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF p_success THEN
    UPDATE public.video_processing_queue
    SET 
      status = 'completed',
      locked_by = NULL,
      locked_at = NULL,
      completed_at = now(),
      updated_at = now()
    WHERE job_id = p_job_id;
  ELSE
    -- Calculate exponential backoff: 1s, 2s, 4s
    v_backoff_seconds := POWER(2, LEAST(v_current.attempt_count, 3))::INTEGER;
    
    IF v_current.attempt_count >= v_current.max_attempts THEN
      -- Max retries reached - mark as failed permanently
      UPDATE public.video_processing_queue
      SET 
        status = 'failed',
        error_message = p_error,
        locked_by = NULL,
        locked_at = NULL,
        updated_at = now()
      WHERE job_id = p_job_id;
    ELSE
      -- Schedule for retry
      UPDATE public.video_processing_queue
      SET 
        status = 'failed',
        error_message = p_error,
        locked_by = NULL,
        locked_at = NULL,
        next_retry_at = now() + (v_backoff_seconds || ' seconds')::interval,
        updated_at = now()
      WHERE job_id = p_job_id;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to enqueue a new job
CREATE OR REPLACE FUNCTION public.enqueue_video_job(
  p_video_path TEXT,
  p_job_id TEXT,
  p_user_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.video_processing_queue (video_path, job_id, user_id, metadata)
  VALUES (p_video_path, p_job_id, p_user_id, p_metadata)
  ON CONFLICT (job_id) DO NOTHING
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Add trigger for updated_at
CREATE TRIGGER update_video_queue_updated_at
BEFORE UPDATE ON public.video_processing_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();