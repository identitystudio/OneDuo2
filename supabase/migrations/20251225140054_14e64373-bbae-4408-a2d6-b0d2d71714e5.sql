
-- ============================================
-- IRON VAULT SECURITY HARDENING MIGRATION
-- ============================================

-- 1. PUBLIC_COURSES VIEW: Recreate with security_invoker = true
-- This ensures the view runs with the caller's permissions, not definer's
DROP VIEW IF EXISTS public.public_courses;
CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS SELECT 
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
    -- REMOVED: email, user_id, email_hash, team_notification_email (sensitive data)
FROM courses
WHERE share_enabled = true AND status = 'completed';

-- 2. DOWNLOAD_ANALYTICS VIEW: Recreate with security_invoker = true
-- And restrict to service_role only via RLS on base table (already done on artifact_access_log)
DROP VIEW IF EXISTS public.download_analytics;
CREATE VIEW public.download_analytics 
WITH (security_invoker = true)
AS SELECT 
    course_id,
    date_trunc('day', accessed_at) AS download_date,
    count(*) AS total_accesses,
    count(DISTINCT accessor_hash) AS unique_users,
    count(DISTINCT ip_address) AS unique_ips,
    count(*) FILTER (WHERE access_type = 'download') AS downloads,
    count(*) FILTER (WHERE access_type = 'signed_url') AS url_generations
FROM artifact_access_log
GROUP BY course_id, date_trunc('day', accessed_at);

-- 3. SUPPORT_CONVERSATIONS: Clean up duplicate SELECT policies
-- Keep only the strict user_id = auth.uid() policy
DROP POLICY IF EXISTS "Users can view their support conversations with rate limit" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can view own support conversations securely" ON public.support_conversations;

-- Create single, strict SELECT policy
CREATE POLICY "Strict owner SELECT on support_conversations"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND user_email = auth.email())
);

-- 4. Ensure courses service_role policy uses proper check
DROP POLICY IF EXISTS "courses_service_role_all" ON public.courses;
CREATE POLICY "courses_service_role_all"
ON public.courses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Verify batch_jobs has FORCE ROW LEVEL SECURITY
ALTER TABLE public.batch_jobs FORCE ROW LEVEL SECURITY;

-- 6. Verify email_subscribers has FORCE ROW LEVEL SECURITY  
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- 7. Verify artifact_access_log has FORCE ROW LEVEL SECURITY (base for download_analytics)
ALTER TABLE public.artifact_access_log FORCE ROW LEVEL SECURITY;
