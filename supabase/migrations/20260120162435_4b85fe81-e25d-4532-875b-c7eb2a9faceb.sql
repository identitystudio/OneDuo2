-- ============ PERMANENT FIX: Production-Grade Multi-Video Pipeline ============

-- 1. Add visibility_timeout and claimed_by columns for proper job claiming
ALTER TABLE processing_queue 
ADD COLUMN IF NOT EXISTS visibility_timeout TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS claimed_by TEXT DEFAULT NULL;

-- 2. Create index for efficient pending job lookup
CREATE INDEX IF NOT EXISTS idx_processing_queue_pending_jobs 
ON processing_queue (created_at) 
WHERE status = 'pending' AND purged = false;

-- 3. Create index for finding jobs to auto-queue
CREATE INDEX IF NOT EXISTS idx_course_modules_queued 
ON course_modules (course_id, module_number) 
WHERE status = 'queued' AND (purged IS NULL OR purged = false);

-- 4. Create the module completion trigger that auto-queues next modules
CREATE OR REPLACE FUNCTION queue_next_module_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_course_id UUID;
  v_next_module RECORD;
  v_active_count INTEGER;
  v_max_parallel INTEGER := 3;
  v_course_fps INTEGER;
  v_has_frames BOOLEAN;
BEGIN
  v_course_id := NEW.course_id;
  
  -- Only fire when status changes TO 'completed'
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  
  -- Count currently active module jobs for this course
  SELECT COUNT(*) INTO v_active_count
  FROM processing_queue pq
  WHERE pq.course_id = v_course_id
    AND pq.step LIKE '%_module'
    AND pq.status IN ('pending', 'processing', 'awaiting_webhook')
    AND (pq.purged IS NULL OR pq.purged = false);
  
  -- If under parallel limit, queue next module
  IF v_active_count < v_max_parallel THEN
    -- Find the next queued module
    SELECT cm.* INTO v_next_module
    FROM course_modules cm
    WHERE cm.course_id = v_course_id
      AND cm.status = 'queued'
      AND (cm.purged IS NULL OR cm.purged = false)
    ORDER BY cm.module_number
    LIMIT 1;
    
    IF FOUND THEN
      -- Get course FPS setting
      SELECT fps_target INTO v_course_fps
      FROM courses WHERE id = v_course_id;
      
      -- Check if module has pre-extracted frames
      v_has_frames := (v_next_module.frame_urls IS NOT NULL AND jsonb_array_length(v_next_module.frame_urls) > 0);
      
      -- Insert queue entry for next module
      -- Use transcribe_module if frames exist, otherwise transcribe_and_extract_module
      INSERT INTO processing_queue (course_id, step, status, metadata)
      VALUES (
        v_course_id, 
        CASE WHEN v_has_frames THEN 'transcribe_module' ELSE 'transcribe_and_extract_module' END,
        'pending', 
        jsonb_build_object(
          'moduleNumber', v_next_module.module_number, 
          'autoQueued', true,
          'triggeredByModule', NEW.module_number,
          'hasPreExtractedFrames', v_has_frames
        )
      )
      ON CONFLICT DO NOTHING; -- Prevent duplicates
      
      RAISE NOTICE 'Auto-queued module % for course %', v_next_module.module_number, v_course_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS trg_queue_next_module ON course_modules;

CREATE TRIGGER trg_queue_next_module
AFTER UPDATE ON course_modules
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
EXECUTE FUNCTION queue_next_module_on_completion();

-- 5. Create function to atomically claim a job with visibility timeout
CREATE OR REPLACE FUNCTION claim_processing_job(
  p_worker_id TEXT,
  p_visibility_seconds INTEGER DEFAULT 300
)
RETURNS TABLE(
  job_id UUID,
  course_id UUID,
  step TEXT,
  metadata JSONB,
  attempt_count INTEGER
) AS $$
DECLARE
  v_job RECORD;
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
  
  -- Claim the job with visibility timeout
  UPDATE processing_queue
  SET 
    status = 'processing',
    claimed_by = p_worker_id,
    visibility_timeout = now() + (p_visibility_seconds || ' seconds')::interval,
    started_at = COALESCE(started_at, now()),
    attempt_count = COALESCE(attempt_count, 0) + 1
  WHERE id = v_job.id;
  
  RETURN QUERY SELECT v_job.id, v_job.course_id, v_job.step, v_job.metadata, COALESCE(v_job.attempt_count, 0) + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Create function to extend visibility timeout (heartbeat)
CREATE OR REPLACE FUNCTION extend_job_visibility(
  p_job_id UUID,
  p_worker_id TEXT,
  p_visibility_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE processing_queue
  SET 
    visibility_timeout = now() + (p_visibility_seconds || ' seconds')::interval,
    started_at = now() -- Also refresh started_at for watchdog
  WHERE id = p_job_id 
    AND claimed_by = p_worker_id
    AND status = 'processing';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Create function to complete a job
CREATE OR REPLACE FUNCTION complete_processing_job(
  p_job_id UUID,
  p_worker_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE processing_queue
  SET 
    status = 'completed',
    completed_at = now(),
    visibility_timeout = NULL,
    claimed_by = NULL
  WHERE id = p_job_id 
    AND claimed_by = p_worker_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Create function to fail a job (with optional requeue)
CREATE OR REPLACE FUNCTION fail_processing_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_error_message TEXT,
  p_should_retry BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_attempt_count INTEGER;
  v_max_attempts INTEGER := 5;
BEGIN
  SELECT attempt_count INTO v_attempt_count
  FROM processing_queue
  WHERE id = p_job_id;
  
  IF p_should_retry AND COALESCE(v_attempt_count, 0) < v_max_attempts THEN
    -- Requeue for retry
    UPDATE processing_queue
    SET 
      status = 'pending',
      started_at = NULL,
      visibility_timeout = NULL,
      claimed_by = NULL,
      error_message = p_error_message
    WHERE id = p_job_id 
      AND claimed_by = p_worker_id;
  ELSE
    -- Mark as permanently failed
    UPDATE processing_queue
    SET 
      status = 'failed',
      completed_at = now(),
      visibility_timeout = NULL,
      claimed_by = NULL,
      error_message = p_error_message
    WHERE id = p_job_id 
      AND claimed_by = p_worker_id;
  END IF;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Add comment explaining the new system
COMMENT ON FUNCTION claim_processing_job IS 'Atomically claims a pending job with visibility timeout for reliable processing';
COMMENT ON FUNCTION queue_next_module_on_completion IS 'Auto-queues next module when one completes, maintaining parallel processing limit';
COMMENT ON TRIGGER trg_queue_next_module ON course_modules IS 'Fires when module status changes to completed, auto-queues next module';