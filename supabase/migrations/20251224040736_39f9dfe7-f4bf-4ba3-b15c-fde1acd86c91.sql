-- Drop ALL existing policies on email_subscribers to eliminate conflicts
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role only access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Block all non-service access" ON public.email_subscribers;

-- Ensure RLS is enabled and forced
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Create ONLY a blocking policy for anon and authenticated users
-- Service role bypasses RLS by default, so no policy needed for it
CREATE POLICY "Deny all client access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);