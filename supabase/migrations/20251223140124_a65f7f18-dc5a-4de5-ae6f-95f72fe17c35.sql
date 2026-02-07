-- Drop all existing SELECT policies on course_modules to start fresh
DROP POLICY IF EXISTS "Authenticated users can view their course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Anonymous users cannot view course modules" ON public.course_modules;

-- Create a strict, clean SELECT policy for authenticated users only
-- This requires ownership verification through the courses table
CREATE POLICY "Course owners can view their modules"
ON public.course_modules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (
      courses.user_id = auth.uid() 
      OR courses.email = auth.email()
    )
  )
);

-- Explicitly block ALL anonymous access
CREATE POLICY "Block anonymous SELECT on course_modules"
ON public.course_modules
FOR SELECT
TO anon
USING (false);

-- Ensure UPDATE policies are also strict (drop old, create new)
DROP POLICY IF EXISTS "Users can update modules of their courses" ON public.course_modules;
DROP POLICY IF EXISTS "Users can update their course modules by auth" ON public.course_modules;

CREATE POLICY "Course owners can update their modules"
ON public.course_modules
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);

-- Ensure DELETE policies are also strict
DROP POLICY IF EXISTS "Users can delete modules of their courses" ON public.course_modules;
DROP POLICY IF EXISTS "Users can delete their course modules by auth" ON public.course_modules;

CREATE POLICY "Course owners can delete their modules"
ON public.course_modules
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);

-- Ensure INSERT policies are strict
DROP POLICY IF EXISTS "Users can insert modules for their courses" ON public.course_modules;

CREATE POLICY "Course owners can insert modules"
ON public.course_modules
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);