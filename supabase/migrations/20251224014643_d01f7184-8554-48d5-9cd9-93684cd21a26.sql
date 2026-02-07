-- Block anonymous users from accessing the courses table
-- This protects email addresses from being exposed to unauthenticated requests

DROP POLICY IF EXISTS "Block anonymous access to courses" ON public.courses;

-- Create a restrictive policy that explicitly blocks anon role
-- RESTRICTIVE means ALL policies must pass for access to be granted
-- USING (false) ensures anon users will NEVER pass this policy
CREATE POLICY "Block anonymous access to courses"
ON public.courses
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);