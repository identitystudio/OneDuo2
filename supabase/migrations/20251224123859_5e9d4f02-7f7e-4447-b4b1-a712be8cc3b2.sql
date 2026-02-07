-- Clean up redundant/conflicting policies on email_subscribers
-- Keep only the service role policy

-- Remove the policy that explicitly denies anon/authenticated (redundant with service role only)
DROP POLICY IF EXISTS "Service role only access to email_subscribers" ON public.email_subscribers;

-- Remove any old permissive policies 
DROP POLICY IF EXISTS "Service role can manage email_subscribers" ON public.email_subscribers;

-- Ensure only service role policy remains
-- This is the correct approach: USING true for service_role roles
DROP POLICY IF EXISTS "Service role only for email_subscribers" ON public.email_subscribers;

CREATE POLICY "email_subscribers_service_role_only"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- For batch_jobs, ensure it's locked to service role
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batch jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "Service role batch jobs access" ON public.batch_jobs;

CREATE POLICY "batch_jobs_service_role_only"
ON public.batch_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Update public_courses view to exclude email (it's already excluded but be explicit)
-- The view is safe because it doesn't include the email column