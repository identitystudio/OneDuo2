-- Fix: Convert public_courses view to SECURITY INVOKER
-- This ensures the view uses the querying user's permissions, not the creator's

DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  share_enabled,
  share_token,
  created_at
FROM public.courses
WHERE share_enabled = true AND status = 'completed';

-- Grant read access for shared courses
GRANT SELECT ON public.public_courses TO anon, authenticated;