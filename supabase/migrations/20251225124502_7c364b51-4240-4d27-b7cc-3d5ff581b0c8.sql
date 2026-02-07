-- 1. Drop the existing insecure view
DROP VIEW IF EXISTS public.public_courses;

-- 2. Recreate the view with 'security_invoker = true' 
-- This forces the view to check RLS policies of the underlying tables
CREATE VIEW public.public_courses 
WITH (security_invoker = true) AS 
SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    share_token,
    share_enabled,
    created_at
    -- EXCLUDED: email, user_id, email_hash to prevent harvesting
FROM public.courses
WHERE share_enabled = true AND status = 'completed';