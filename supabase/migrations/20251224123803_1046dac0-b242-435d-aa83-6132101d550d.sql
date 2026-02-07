-- Fix the SECURITY DEFINER view issue
-- Change the view to use SECURITY INVOKER (the default, but being explicit)

DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS
SELECT 
  id,
  title,
  description,
  status,
  created_at,
  is_multi_module,
  module_count,
  video_duration_seconds,
  share_token
FROM public.courses
WHERE share_enabled = true;