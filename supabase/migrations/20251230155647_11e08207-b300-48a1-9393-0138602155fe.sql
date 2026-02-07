-- Fix 1: Ensure email_subscribers has explicit blocking for non-service roles
-- The table already has a restrictive service_role policy, but let's add an explicit block

-- Drop existing policy if it exists and recreate with proper blocking
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Create explicit block for all non-service access
CREATE POLICY "Block all non-service access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO public
USING (false)
WITH CHECK (false);

-- Create service role access policy
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 2: Recreate download_analytics view with security_invoker = true
-- First drop the existing view
DROP VIEW IF EXISTS public.download_analytics;

-- Recreate the view with security_invoker enabled so it respects RLS of underlying tables
CREATE VIEW public.download_analytics
WITH (security_invoker = true)
AS
SELECT 
  course_id,
  DATE_TRUNC('day', accessed_at) as download_date,
  COUNT(*) as total_accesses,
  COUNT(DISTINCT accessor_hash) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE access_type = 'url_generation') as url_generations,
  COUNT(*) FILTER (WHERE download_completed = true) as downloads
FROM public.artifact_access_log
GROUP BY course_id, DATE_TRUNC('day', accessed_at);

-- Grant appropriate access to the view
GRANT SELECT ON public.download_analytics TO service_role;