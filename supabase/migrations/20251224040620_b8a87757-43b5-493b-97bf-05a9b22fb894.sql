-- Ensure RLS is enabled on email_subscribers
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner too (extra security)
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Drop any existing permissive policies that might allow access
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;

-- Create a single PERMISSIVE policy that ONLY allows service_role access
-- Since this is the only permissive policy, all other access is denied by default
CREATE POLICY "Service role only access"
ON public.email_subscribers
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Service role bypasses RLS by default, but let's be explicit
CREATE POLICY "Service role full access"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);