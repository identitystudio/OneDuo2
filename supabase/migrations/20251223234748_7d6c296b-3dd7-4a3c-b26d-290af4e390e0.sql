-- Ensure RLS is enabled on email_subscribers
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner as well
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Drop the existing restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Service role only" ON public.email_subscribers;

-- Create permissive policy for service role (allows service role full access)
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO authenticated, anon
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Block anonymous SELECT explicitly
CREATE POLICY "Block anonymous access to email_subscribers"
ON public.email_subscribers
FOR SELECT
TO anon
USING (false);