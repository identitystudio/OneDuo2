-- Update the step check constraint to include all valid steps
ALTER TABLE processing_queue DROP CONSTRAINT IF EXISTS processing_queue_step_check;

ALTER TABLE processing_queue ADD CONSTRAINT processing_queue_step_check 
CHECK (step = ANY (ARRAY[
  'transcribe'::text, 
  'extract_frames'::text, 
  'render_gifs'::text, 
  'train_ai'::text,
  'analyze_audio'::text,
  'transcribe_module'::text,
  'extract_frames_module'::text,
  'render_gifs_module'::text,
  'train_ai_module'::text,
  'analyze_audio_module'::text,
  'check_next_module'::text
]));

-- Create a function for atomic step completion + next step queuing
CREATE OR REPLACE FUNCTION complete_step_and_queue_next(
  p_job_id uuid,
  p_course_id uuid,
  p_next_step text DEFAULT NULL,
  p_next_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark current job as completed
  UPDATE processing_queue 
  SET status = 'completed', 
      completed_at = now() 
  WHERE id = p_job_id;
  
  -- Queue next step if provided
  IF p_next_step IS NOT NULL THEN
    INSERT INTO processing_queue (course_id, step, status, metadata)
    VALUES (p_course_id, p_next_step, 'pending', COALESCE(p_next_metadata, '{}'::jsonb));
  END IF;
END;
$$;

-- Create a function to detect and fix intermediate stuck states
CREATE OR REPLACE FUNCTION detect_stuck_intermediate_states()
RETURNS TABLE(
  course_id uuid,
  course_status text,
  last_completed_step text,
  next_step text,
  stuck_since timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as course_id,
    c.status as course_status,
    pq.step as last_completed_step,
    CASE 
      WHEN pq.step = 'transcribe' THEN 'extract_frames'
      WHEN pq.step = 'extract_frames' THEN 'analyze_audio'
      WHEN pq.step = 'analyze_audio' THEN 'train_ai'
      WHEN pq.step = 'transcribe_module' THEN 'extract_frames_module'
      WHEN pq.step = 'extract_frames_module' THEN 'analyze_audio_module'
      WHEN pq.step = 'analyze_audio_module' THEN 'train_ai_module'
      ELSE NULL
    END as next_step,
    pq.completed_at as stuck_since
  FROM courses c
  INNER JOIN processing_queue pq ON pq.course_id = c.id
  WHERE 
    -- Course is in an intermediate processing state (not completed/failed/queued)
    c.status NOT IN ('completed', 'failed', 'queued')
    -- The last queue job for this course is completed
    AND pq.status = 'completed'
    -- No pending or processing jobs exist for this course
    AND NOT EXISTS (
      SELECT 1 FROM processing_queue pq2 
      WHERE pq2.course_id = c.id 
      AND pq2.status IN ('pending', 'processing')
    )
    -- The completed job is the most recent one
    AND pq.completed_at = (
      SELECT MAX(completed_at) FROM processing_queue pq3 WHERE pq3.course_id = c.id
    )
    -- Stuck for at least 2 minutes
    AND pq.completed_at < now() - interval '2 minutes';
END;
$$;