-- Enable RLS on email_subscribers table
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner as well
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Ensure service role has full access
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');