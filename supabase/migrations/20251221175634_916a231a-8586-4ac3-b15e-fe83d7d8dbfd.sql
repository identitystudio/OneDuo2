-- Lock down sensitive tables to service role only (fix security scan errors)

-- EMAIL_SUBSCRIBERS: contains PII (email, name, purchase status). Must not be readable/writable by anon/authenticated.
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Remove any existing policies that could allow broader access
DROP POLICY IF EXISTS "Service role only access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role only access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.email_subscribers;

-- Ensure table-level privileges are not granted to client roles
REVOKE ALL ON TABLE public.email_subscribers FROM anon;
REVOKE ALL ON TABLE public.email_subscribers FROM authenticated;

-- Allow only backend service role
CREATE POLICY "Service role only"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');


-- COURSES: contains user emails; app uses backend functions with service role.
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Remove any client-facing policies (including header-based / authenticated policies)
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can create courses with email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view own courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can insert own courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update own courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can delete own courses" ON public.courses;
DROP POLICY IF EXISTS "Service role full access to courses" ON public.courses;

-- Ensure table-level privileges are not granted to client roles
REVOKE ALL ON TABLE public.courses FROM anon;
REVOKE ALL ON TABLE public.courses FROM authenticated;

-- Allow only backend service role
CREATE POLICY "Service role only"
ON public.courses
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
