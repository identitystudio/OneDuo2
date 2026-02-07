-- Fix 1: email_subscribers - Already fixed in first migration, just add service role policy
CREATE POLICY "Service role only access to subscribers"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 2: courses - Require authenticated users and proper ownership using 'email' column
DROP POLICY IF EXISTS "Users can view own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can insert own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;

-- Courses accessible only via authenticated users matching their email
CREATE POLICY "Authenticated users can view own courses"
ON public.courses
FOR SELECT
TO authenticated
USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Authenticated users can insert own courses"
ON public.courses
FOR INSERT
TO authenticated
WITH CHECK (email = auth.jwt() ->> 'email');

CREATE POLICY "Authenticated users can update own courses"
ON public.courses
FOR UPDATE
TO authenticated
USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Authenticated users can delete own courses"
ON public.courses
FOR DELETE
TO authenticated
USING (email = auth.jwt() ->> 'email');

-- Service role for edge functions
CREATE POLICY "Service role full access to courses"
ON public.courses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);