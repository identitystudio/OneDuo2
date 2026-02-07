-- Add job_verification table to track output verification results
CREATE TABLE IF NOT EXISTS public.job_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.processing_queue(id) ON DELETE SET NULL,
  course_id UUID NOT NULL,
  step TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed_critical TEXT[] NOT NULL DEFAULT '{}',
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_by TEXT NOT NULL DEFAULT 'system'
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_job_verifications_course_id ON public.job_verifications(course_id);
CREATE INDEX IF NOT EXISTS idx_job_verifications_verified ON public.job_verifications(verified);

-- Enable RLS
ALTER TABLE public.job_verifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend operations only)
CREATE POLICY "Service role can manage verifications" ON public.job_verifications
  FOR ALL USING (true);

-- Add constraint_status to processing_queue if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'processing_queue' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE public.processing_queue ADD COLUMN verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'skipped'));
  END IF;
END $$;

-- Create function to check pipeline health
CREATE OR REPLACE FUNCTION public.check_pipeline_health()
RETURNS TABLE(
  healthy BOOLEAN,
  stuck_processing_count INTEGER,
  stuck_pending_count INTEGER,
  critical_violations_count INTEGER,
  failed_verifications_count INTEGER,
  oldest_stuck_job_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stuck_processing INTEGER;
  v_stuck_pending INTEGER;
  v_critical_violations INTEGER;
  v_failed_verifications INTEGER;
  v_oldest_hours NUMERIC;
BEGIN
  -- Count processing jobs stuck for >30 min
  SELECT COUNT(*) INTO v_stuck_processing
  FROM processing_queue
  WHERE status = 'processing'
    AND started_at < now() - interval '30 minutes'
    AND purged = false;
  
  -- Count pending jobs older than 10 min (should have been picked up)
  SELECT COUNT(*) INTO v_stuck_pending
  FROM processing_queue
  WHERE status = 'pending'
    AND created_at < now() - interval '10 minutes'
    AND purged = false;
  
  -- Count unresolved critical violations
  SELECT COUNT(*) INTO v_critical_violations
  FROM constraint_violations
  WHERE resolved = false
    AND severity = 'critical'
    AND detected_at > now() - interval '24 hours';
  
  -- Count failed verifications in last 24h
  SELECT COUNT(*) INTO v_failed_verifications
  FROM job_verifications
  WHERE verified = false
    AND verified_at > now() - interval '24 hours';
  
  -- Find oldest stuck job age in hours
  SELECT EXTRACT(EPOCH FROM (now() - MIN(started_at))) / 3600.0 INTO v_oldest_hours
  FROM processing_queue
  WHERE status = 'processing'
    AND purged = false;
  
  RETURN QUERY SELECT
    (v_stuck_processing = 0 AND v_critical_violations = 0) AS healthy,
    v_stuck_processing AS stuck_processing_count,
    v_stuck_pending AS stuck_pending_count,
    v_critical_violations AS critical_violations_count,
    v_failed_verifications AS failed_verifications_count,
    COALESCE(v_oldest_hours, 0) AS oldest_stuck_job_hours;
END;
$$;

-- Create function to detect and auto-recover stalled jobs
CREATE OR REPLACE FUNCTION public.auto_recover_stalled_jobs(p_max_jobs INTEGER DEFAULT 5)
RETURNS TABLE(
  recovered_count INTEGER,
  failed_count INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recovered INTEGER := 0;
  v_failed INTEGER := 0;
  v_details JSONB := '[]'::jsonb;
  v_job RECORD;
BEGIN
  -- Find stalled jobs (processing > 30 min without visibility timeout update)
  FOR v_job IN
    SELECT pq.id, pq.course_id, pq.step, pq.attempt_count, pq.started_at
    FROM processing_queue pq
    WHERE pq.status = 'processing'
      AND pq.purged = false
      AND (
        pq.visibility_timeout IS NULL 
        OR pq.visibility_timeout < now()
      )
      AND pq.started_at < now() - interval '30 minutes'
    ORDER BY pq.started_at ASC
    LIMIT p_max_jobs
  LOOP
    -- Check if course has data (frames exist = should recover, not fail)
    IF EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = v_job.course_id
        AND c.frame_urls IS NOT NULL
        AND jsonb_array_length(c.frame_urls) > 0
    ) THEN
      -- Has data - reset to pending for retry
      UPDATE processing_queue
      SET status = 'pending',
          started_at = NULL,
          visibility_timeout = NULL,
          claimed_by = NULL,
          attempt_count = v_job.attempt_count + 1,
          error_message = 'Auto-recovered by stalled job detector (data exists)'
      WHERE id = v_job.id;
      
      v_recovered := v_recovered + 1;
    ELSE
      -- No data after 30 min - check attempt count
      IF v_job.attempt_count >= 5 THEN
        UPDATE processing_queue
        SET status = 'failed',
            completed_at = now(),
            error_message = 'Max recovery attempts exceeded'
        WHERE id = v_job.id;
        
        UPDATE courses
        SET status = 'failed',
            error_message = 'Processing timed out after multiple attempts'
        WHERE id = v_job.course_id;
        
        v_failed := v_failed + 1;
      ELSE
        UPDATE processing_queue
        SET status = 'pending',
            started_at = NULL,
            visibility_timeout = NULL,
            claimed_by = NULL,
            attempt_count = v_job.attempt_count + 1,
            error_message = format('Auto-recovered attempt %s', v_job.attempt_count + 1)
        WHERE id = v_job.id;
        
        v_recovered := v_recovered + 1;
      END IF;
    END IF;
    
    v_details := v_details || jsonb_build_object(
      'job_id', v_job.id,
      'course_id', v_job.course_id,
      'step', v_job.step,
      'action', CASE WHEN v_job.attempt_count >= 5 THEN 'failed' ELSE 'recovered' END
    );
  END LOOP;
  
  RETURN QUERY SELECT v_recovered, v_failed, v_details;
END;
$$;

-- Create function to verify course outputs
CREATE OR REPLACE FUNCTION public.verify_course_outputs(p_course_id UUID)
RETURNS TABLE(
  verified BOOLEAN,
  frame_count INTEGER,
  has_transcript BOOLEAN,
  failed_checks TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course RECORD;
  v_failed TEXT[] := '{}';
BEGIN
  SELECT * INTO v_course
  FROM courses
  WHERE id = p_course_id;
  
  IF v_course.id IS NULL THEN
    RETURN QUERY SELECT false, 0, false, ARRAY['course_not_found']::TEXT[];
    RETURN;
  END IF;
  
  -- Check frames
  IF v_course.frame_urls IS NULL OR jsonb_array_length(v_course.frame_urls) = 0 THEN
    v_failed := array_append(v_failed, 'no_frames');
  END IF;
  
  -- Check if frame count matches expected (with 80% tolerance)
  IF v_course.total_frames IS NOT NULL AND v_course.total_frames > 0 THEN
    IF jsonb_array_length(COALESCE(v_course.frame_urls, '[]'::jsonb)) < (v_course.total_frames * 0.8) THEN
      v_failed := array_append(v_failed, 'insufficient_frames');
    END IF;
  END IF;
  
  RETURN QUERY SELECT
    (array_length(v_failed, 1) IS NULL OR array_length(v_failed, 1) = 0) AS verified,
    jsonb_array_length(COALESCE(v_course.frame_urls, '[]'::jsonb))::INTEGER AS frame_count,
    (v_course.transcript IS NOT NULL AND v_course.transcript != '[]'::jsonb AND v_course.transcript != '{}'::jsonb) AS has_transcript,
    v_failed AS failed_checks;
END;
$$;