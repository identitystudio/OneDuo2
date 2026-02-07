-- =====================================================
-- CRITICAL SECURITY FIX: Hardening RLS Policies
-- =====================================================

-- 1. FIX: email_subscribers - Ensure complete lockdown
-- Drop existing policies and recreate with proper PERMISSIVE deny
DROP POLICY IF EXISTS "Deny anon access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Deny authenticated access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Service role is the ONLY access (no anon/authenticated at all)
CREATE POLICY "email_subscribers_service_role_only" 
ON public.email_subscribers 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. FIX: courses - Create a secure view that hides email for non-owners
-- First, ensure the existing public_courses view doesn't expose email
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses AS
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

-- Grant access to the view
GRANT SELECT ON public.public_courses TO anon, authenticated;

-- 3. FIX: download_analytics - Restrict view to service role only
DROP VIEW IF EXISTS public.download_analytics;

CREATE VIEW public.download_analytics 
WITH (security_invoker = true)
AS
SELECT 
  course_id,
  DATE_TRUNC('day', accessed_at) as download_date,
  COUNT(*) as total_accesses,
  COUNT(*) FILTER (WHERE download_completed = true) as downloads,
  COUNT(DISTINCT accessor_hash) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE access_type = 'url_generation') as url_generations
FROM public.artifact_access_log
GROUP BY course_id, DATE_TRUNC('day', accessed_at);

-- Revoke all access from anon/authenticated - only service role
REVOKE ALL ON public.download_analytics FROM anon, authenticated;
GRANT SELECT ON public.download_analytics TO service_role;

-- 4. FIX: artifact_access_log - Ensure complete lockdown
DROP POLICY IF EXISTS "Block non-service access to artifact_access_log" ON public.artifact_access_log;
DROP POLICY IF EXISTS "Service role only for artifact_access_log" ON public.artifact_access_log;

-- Single permissive policy for service role only
CREATE POLICY "artifact_access_log_service_role_only" 
ON public.artifact_access_log 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 5. ADDITIONAL: Ensure batch_jobs is also locked down (contains user emails)
DROP POLICY IF EXISTS "Deny anon access to batch_jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "Deny authenticated access to batch_jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "batch_jobs_service_role_only" ON public.batch_jobs;

CREATE POLICY "batch_jobs_service_role_only" 
ON public.batch_jobs 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');