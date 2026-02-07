-- Drop existing policies on email_subscribers that may have issues
DROP POLICY IF EXISTS "Deny all client access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;

-- Create a single permissive policy that ONLY allows service_role access
-- This is the correct pattern: default deny all, explicit allow for service_role only
CREATE POLICY "Service role only access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Separate policy for service role (uses TO service_role which is a special role)
CREATE POLICY "Service role can manage email_subscribers"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);