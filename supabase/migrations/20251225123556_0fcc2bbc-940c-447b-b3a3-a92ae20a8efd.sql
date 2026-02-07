-- Fix: Recreate public_courses view WITHOUT email column to prevent exposure
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  video_duration_seconds,
  is_multi_module,
  module_count,
  created_at,
  status,
  share_token
FROM public.courses
WHERE share_enabled = true AND status = 'completed';

-- Ensure only service role can query this view
REVOKE ALL ON public.public_courses FROM anon, authenticated;
GRANT SELECT ON public.public_courses TO service_role;

COMMENT ON VIEW public.public_courses IS 'Public course metadata - explicitly excludes email and sensitive data';