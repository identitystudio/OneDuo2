-- Create function to detect concurrency counter drift
-- Compares processing_concurrency.active_jobs against actual processing jobs
CREATE OR REPLACE FUNCTION public.detect_concurrency_drift()
RETURNS TABLE(user_email text, reported_count integer, actual_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.user_email,
    pc.active_jobs as reported_count,
    COALESCE(actual.job_count, 0)::integer as actual_count
  FROM public.processing_concurrency pc
  LEFT JOIN (
    -- Count actual processing jobs per user email
    SELECT c.email, COUNT(*)::integer as job_count
    FROM public.processing_queue pq
    JOIN public.courses c ON pq.course_id = c.id
    WHERE pq.status = 'processing'
    GROUP BY c.email
  ) actual ON actual.email = pc.user_email
  WHERE pc.active_jobs != COALESCE(actual.job_count, 0)
    AND pc.last_updated < now() - interval '2 minutes'; -- Only fix if stale for 2+ minutes
END;
$$;