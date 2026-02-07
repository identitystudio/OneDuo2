-- Fix 1: email_subscribers - Remove any public access, service role ONLY
DROP POLICY IF EXISTS "Service role full access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role only access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.email_subscribers;

-- Only service role can access email_subscribers (for edge functions)
CREATE POLICY "Service role only access"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 2: courses - Remove header-based policies, use only authenticated user policies
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can create courses with email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their courses" ON public.courses;

-- Keep only the authenticated user policies (already exist from previous migration)