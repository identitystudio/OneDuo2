-- PARALLEL PROCESSING: Increase concurrency limits for faster multi-module uploads
-- Default to 3 per user (was 1), global stays at 10

-- Update can_start_job to allow 3 concurrent jobs per user
CREATE OR REPLACE FUNCTION public.can_start_job(p_user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_per_user_limit INTEGER;
  v_global_limit INTEGER;
  v_user_active INTEGER;
  v_global_active INTEGER;
BEGIN
  -- Get limits from settings (allows runtime tuning)
  SELECT (value->>'per_user')::int, (value->>'global')::int
  INTO v_per_user_limit, v_global_limit
  FROM public.system_settings
  WHERE key = 'concurrency_limits';
  
  -- PARALLEL PROCESSING: Default to 3 per user (was 1), global 15
  v_per_user_limit := COALESCE(v_per_user_limit, 3);
  v_global_limit := COALESCE(v_global_limit, 15);
  
  -- Count user's active jobs
  SELECT COALESCE(active_jobs, 0) INTO v_user_active
  FROM public.processing_concurrency
  WHERE user_email = p_user_email;
  
  -- Count global active jobs
  SELECT COALESCE(SUM(active_jobs), 0) INTO v_global_active
  FROM public.processing_concurrency;
  
  RETURN (COALESCE(v_user_active, 0) < v_per_user_limit) 
     AND (COALESCE(v_global_active, 0) < v_global_limit);
END;
$function$;

-- Add helper function to queue multiple modules in parallel
CREATE OR REPLACE FUNCTION public.queue_parallel_modules(
  p_course_id uuid,
  p_max_parallel integer DEFAULT 3
)
RETURNS TABLE(module_number integer, queued boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_module RECORD;
  v_queued_count INTEGER := 0;
BEGIN
  -- Find modules that are queued but not yet in processing_queue
  FOR v_module IN
    SELECT cm.module_number
    FROM public.course_modules cm
    WHERE cm.course_id = p_course_id
      AND cm.status = 'queued'
      AND NOT EXISTS (
        SELECT 1 FROM public.processing_queue pq
        WHERE pq.course_id = p_course_id
          AND pq.metadata->>'moduleNumber' = cm.module_number::text
          AND pq.status IN ('pending', 'processing', 'awaiting_webhook')
      )
    ORDER BY cm.module_number ASC
    LIMIT p_max_parallel
  LOOP
    -- Check if we've hit the parallel limit
    IF v_queued_count >= p_max_parallel THEN
      EXIT;
    END IF;
    
    module_number := v_module.module_number;
    queued := true;
    v_queued_count := v_queued_count + 1;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$function$;

-- Add function to count active module processing for a course
CREATE OR REPLACE FUNCTION public.count_active_module_jobs(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.processing_queue
  WHERE course_id = p_course_id
    AND status IN ('pending', 'processing', 'awaiting_webhook')
    AND step LIKE '%_module';
  
  RETURN COALESCE(v_count, 0);
END;
$function$;