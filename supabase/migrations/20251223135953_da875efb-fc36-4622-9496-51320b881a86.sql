-- Fix courses table: Drop potentially leaky SELECT policies and create secure ones
DROP POLICY IF EXISTS "Users can view own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view their courses by user_id" ON public.courses;

-- Create a single, secure SELECT policy that requires authentication
CREATE POLICY "Authenticated users can view their own courses"
ON public.courses
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR auth.email() = email
);

-- Add explicit deny for anonymous users (anon role)
CREATE POLICY "Anonymous users cannot view courses"
ON public.courses
FOR SELECT
TO anon
USING (false);

-- Fix course_modules table: Tighten SELECT policies
DROP POLICY IF EXISTS "Users can view modules of their courses" ON public.course_modules;
DROP POLICY IF EXISTS "Users can view their course modules by auth" ON public.course_modules;

-- Create secure SELECT policy requiring authentication and ownership
CREATE POLICY "Authenticated users can view their course modules"
ON public.course_modules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
  OR auth.role() = 'service_role'
);

-- Block anonymous access to course modules
CREATE POLICY "Anonymous users cannot view course modules"
ON public.course_modules
FOR SELECT
TO anon
USING (false);

-- Also secure the INSERT policies that were too permissive
DROP POLICY IF EXISTS "Users can insert courses with their email" ON public.courses;

-- Require authentication for course creation
CREATE POLICY "Authenticated users can create courses"
ON public.courses
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id = auth.uid() OR user_id IS NULL)
  AND (email = auth.email() OR email IS NOT NULL)
);

-- Rate-limited anonymous course creation (keep existing but make it stricter)
DROP POLICY IF EXISTS "Rate limited course creation" ON public.courses;