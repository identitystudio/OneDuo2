-- Creating RPC for atomic module completion increment
CREATE OR REPLACE FUNCTION increment_completed_modules(p_course_id UUID)
RETURNS TABLE (
  new_completed_count INTEGER,
  total_module_count INTEGER,
  is_finished BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_completed INTEGER;
  v_total INTEGER;
  v_progress INTEGER;
BEGIN
  -- Perform atomic increment and return new values
  -- Taking a row lock implicitly via UPDATE
  UPDATE courses
  SET completed_modules = COALESCE(completed_modules, 0) + 1,
      updated_at = NOW()
  WHERE id = p_course_id
  RETURNING completed_modules, module_count INTO v_completed, v_total;

  IF v_completed IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- Check if course is finished
  IF v_completed >= v_total THEN
    -- Mark as completed
    UPDATE courses
    SET status = 'completed',
        progress = 100,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_course_id;
    
    RETURN QUERY SELECT v_completed, v_total, TRUE;
  ELSE
    -- Update progress percentage
    v_progress := LEAST(100, FLOOR(v_completed::FLOAT / v_total::FLOAT * 100));
    
    UPDATE courses
    SET progress = v_progress,
        updated_at = NOW()
    WHERE id = p_course_id;
    
    RETURN QUERY SELECT v_completed, v_total, FALSE;
  END IF;
END;
$$;
