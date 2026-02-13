-- FIX: count_active_module_jobs must exclude purged jobs
-- This was causing false "active job" counts, blocking new modules from being queued

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
    AND purged = false  -- CRITICAL FIX: Exclude purged jobs
    AND step LIKE '%_module';
  
  RETURN COALESCE(v_count, 0);
END;
$function$;
