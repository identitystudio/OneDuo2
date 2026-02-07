-- STEP 1: Lock email_subscribers table
-- BEFORE: Has policies blocking non-service access, but we need to ensure 
-- admin users (from user_roles table) can also read for future-proofing

-- First, drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Block all non-service access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;

-- Create restrictive policy: ONLY service_role can access
-- (Admin access will be through edge functions using service_role)
CREATE POLICY "email_subscribers_service_role_only" 
ON public.email_subscribers 
FOR ALL 
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Service role bypass (service_role bypasses RLS by default, but explicit for clarity)
CREATE POLICY "email_subscribers_service_role_access"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);