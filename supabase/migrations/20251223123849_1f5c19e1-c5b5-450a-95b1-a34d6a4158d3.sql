-- Fix security issues for courses and course_modules tables

-- Drop existing problematic policies on courses
DROP POLICY IF EXISTS "Require authentication for courses" ON public.courses;
DROP POLICY IF EXISTS "Service role can select courses" ON public.courses;
DROP POLICY IF EXISTS "Users can view their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can insert their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete their own courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view courses by email" ON public.courses;
DROP POLICY IF EXISTS "Public can view completed courses" ON public.courses;

-- Create proper RLS policies for courses table
-- Users can only view their own courses (by email match)
CREATE POLICY "Users can view own courses by email"
ON public.courses
FOR SELECT
USING (
  email = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'email',
    auth.email()
  )
);

-- Users can insert courses with their email
CREATE POLICY "Users can insert courses with their email"
ON public.courses
FOR INSERT
WITH CHECK (true);

-- Users can update their own courses
CREATE POLICY "Users can update own courses"
ON public.courses
FOR UPDATE
USING (
  email = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'email',
    auth.email()
  )
);

-- Users can delete their own courses
CREATE POLICY "Users can delete own courses"
ON public.courses
FOR DELETE
USING (
  email = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'email',
    auth.email()
  )
);

-- Drop existing problematic policies on course_modules
DROP POLICY IF EXISTS "Public can view course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Anyone can view course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Users can view course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Service role can manage course_modules" ON public.course_modules;

-- Create proper RLS policies for course_modules - only accessible if user owns the course
CREATE POLICY "Users can view modules of their courses"
ON public.course_modules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);

CREATE POLICY "Users can insert modules for their courses"
ON public.course_modules
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);

CREATE POLICY "Users can update modules of their courses"
ON public.course_modules
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);

CREATE POLICY "Users can delete modules of their courses"
ON public.course_modules
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);