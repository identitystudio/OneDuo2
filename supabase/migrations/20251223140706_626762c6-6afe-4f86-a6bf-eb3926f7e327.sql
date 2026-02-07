-- Remove the overly permissive public courses policy that exposes emails
DROP POLICY IF EXISTS "Public courses view is readable by everyone" ON public.courses;

-- The courses table should ONLY be accessible to authenticated owners
-- Anonymous users should use the public_courses VIEW instead

-- Block all anonymous access to courses table
DROP POLICY IF EXISTS "Anonymous users cannot view courses" ON public.courses;
CREATE POLICY "Block anonymous SELECT on courses"
ON public.courses
FOR SELECT
TO anon
USING (false);

-- Note: The public_courses VIEW is intentionally a read-only view that:
-- 1. Only exposes non-sensitive fields (no email, user_id, storage paths)
-- 2. Is used by CourseView.tsx for AI-readable course pages
-- 3. Views inherit security from the underlying table when using security invoker
-- Since public_courses is a VIEW (not a table), RLS policies are applied to the 
-- underlying courses table. The view definition already filters to safe columns.