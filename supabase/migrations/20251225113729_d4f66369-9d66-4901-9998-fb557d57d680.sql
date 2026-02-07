-- Fix public_courses view security: ensure it only exposes safe public data
-- The view is already protected by only showing share_enabled=true courses
-- But let's make the security explicit and mask team_notification fields

-- Drop and recreate view with explicit column selection (no sensitive data)
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses WITH (security_invoker = true) AS
SELECT 
  id,
  title,
  description,
  video_duration_seconds,
  is_multi_module,
  module_count,
  share_token,
  status,
  created_at
  -- Explicitly EXCLUDE: email, user_id, email_hash, team_notification_email, team_notification_role
FROM courses
WHERE share_enabled = true AND status = 'completed';

-- Add comment documenting security rationale
COMMENT ON VIEW public.public_courses IS 'Public view for shared courses. Explicitly excludes PII (email, user_id, team contacts). Only shows share_enabled=true completed courses.';