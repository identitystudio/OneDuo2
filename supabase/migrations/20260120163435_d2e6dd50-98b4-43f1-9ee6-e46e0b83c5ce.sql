-- Fix 1: Make trigger also queue next module when one FAILS (not just completes)
-- This ensures the pipeline continues even if a single module fails

DROP TRIGGER IF EXISTS trg_queue_next_module ON course_modules;

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
  
  -- Fire when status changes TO 'completed' OR 'failed'
  -- This ensures the pipeline continues even if a single module fails
  IF NEW.status NOT IN ('completed', 'failed') THEN
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
      INSERT INTO processing_queue (course_id, step, status, metadata)
      VALUES (
        v_course_id, 
        CASE WHEN v_has_frames THEN 'transcribe_module' ELSE 'transcribe_and_extract_module' END,
        'pending', 
        jsonb_build_object(
          'moduleNumber', v_next_module.module_number, 
          'autoQueued', true,
          'triggeredByModule', NEW.module_number,
          'triggeredByStatus', NEW.status,
          'hasPreExtractedFrames', v_has_frames
        )
      )
      ON CONFLICT DO NOTHING;
      
      RAISE NOTICE 'Auto-queued module % for course % (triggered by module % with status %)', 
        v_next_module.module_number, v_course_id, NEW.module_number, NEW.status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger to fire on BOTH completed and failed
CREATE TRIGGER trg_queue_next_module
AFTER UPDATE ON course_modules
FOR EACH ROW
WHEN (
  (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
  OR (OLD.status IS DISTINCT FROM 'failed' AND NEW.status = 'failed')
)
EXECUTE FUNCTION queue_next_module_on_completion();