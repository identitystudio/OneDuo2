-- Drop and recreate the public_courses view with security
DROP VIEW IF EXISTS public.public_courses;

-- Recreate view with security_invoker = true so it respects the caller's RLS
CREATE VIEW public.public_courses WITH (security_invoker = true) AS
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
FROM courses
WHERE status = 'completed'::text;

-- Also fix the remaining email_subscribers conflict by checking what policies exist
-- and ensuring only the deny policy remains