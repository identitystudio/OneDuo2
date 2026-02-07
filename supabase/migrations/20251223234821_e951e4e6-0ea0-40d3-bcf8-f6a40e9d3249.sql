-- Ensure RLS is enabled and forced on email_subscribers
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Service role only" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Block anonymous access to email_subscribers" ON public.email_subscribers;

-- Create proper service role access policy (permissive)
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');