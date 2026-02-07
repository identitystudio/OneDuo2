-- Recreate the public_courses view with SECURITY INVOKER
-- This ensures the view respects RLS policies of the underlying courses table
-- Since courses table blocks anonymous access, this view will too

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
    frame_urls,
    transcript,
    created_at
FROM public.courses
WHERE status = 'completed';