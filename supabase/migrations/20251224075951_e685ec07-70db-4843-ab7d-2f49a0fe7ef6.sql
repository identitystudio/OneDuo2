-- Fix SECURITY DEFINER view warning for public_courses
-- Recreate as SECURITY INVOKER (default) with explicit grant

DROP VIEW IF EXISTS public.public_courses;

-- Create view with SECURITY INVOKER (explicit)
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
  created_at
FROM public.courses
WHERE status = 'completed';

-- Grant SELECT to anon and authenticated for public access
GRANT SELECT ON public.public_courses TO anon, authenticated;