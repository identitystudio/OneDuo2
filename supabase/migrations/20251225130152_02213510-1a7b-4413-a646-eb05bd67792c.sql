-- =====================================================
-- FINAL SECURITY HARDENING - IRON VAULT PROTOCOL
-- =====================================================

-- 1. COURSES TABLE: Strict user_id based RLS (no email exposure)
-- Drop existing permissive policies and create strict ones
DROP POLICY IF EXISTS "Users can view own courses securely" ON public.courses;
DROP POLICY IF EXISTS "Block anonymous access to courses" ON public.courses;

-- New strict policy: Only see your own courses by user_id
CREATE POLICY "Strict user owns course SELECT"
ON public.courses
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR (user_id IS NULL AND email = auth.email())
);

-- Block anonymous completely
CREATE POLICY "Block anonymous courses"
ON public.courses
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 2. EMAIL_SUBSCRIBERS: Explicit deny for anon and authenticated
DROP POLICY IF EXISTS "Block non-service access to email_subscribers" ON public.email_subscribers;

CREATE POLICY "Deny anon access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny authenticated access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- 3. BATCH_JOBS: Service role only - block all others
DROP POLICY IF EXISTS "Users can view their own batch jobs by email" ON public.batch_jobs;
DROP POLICY IF EXISTS "Service role can manage batch jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "batch_jobs_service_role_only" ON public.batch_jobs;

CREATE POLICY "batch_jobs_service_role_only"
ON public.batch_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Deny anon access to batch_jobs"
ON public.batch_jobs
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny authenticated access to batch_jobs"
ON public.batch_jobs
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- 4. SUPPORT_CONVERSATIONS: Only see your own by email match
DROP POLICY IF EXISTS "Rate limited support_conversations viewing" ON public.support_conversations;

-- Create strict policy: only see conversations where user_email = your email
CREATE POLICY "Users can only see own support conversations"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (user_id IS NULL AND user_email = auth.email())
);

-- Block anonymous from support conversations
CREATE POLICY "Block anon from support_conversations"
ON public.support_conversations
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 5. Recreate public_courses view with security_invoker (already done but ensuring clean state)
DROP VIEW IF EXISTS public.public_courses;

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
FROM public.courses
WHERE share_enabled = true AND status = 'completed';