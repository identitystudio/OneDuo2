-- Drop existing course_modules policies that use weak email matching
DROP POLICY IF EXISTS "Course owners can delete their modules" ON public.course_modules;
DROP POLICY IF EXISTS "Course owners can insert modules" ON public.course_modules;
DROP POLICY IF EXISTS "Course owners can update their modules" ON public.course_modules;
DROP POLICY IF EXISTS "Course owners can view their modules" ON public.course_modules;

-- Create a security definer function to check course ownership with user_id priority
CREATE OR REPLACE FUNCTION public.user_owns_course_secure(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND (
        -- Primary check: user_id must match (strongest)
        user_id = auth.uid()
        -- Secondary check: only allow email match if user_id is null (legacy data)
        OR (user_id IS NULL AND email = auth.email())
      )
  )
$$;

-- Recreate course_modules policies with stronger checks
CREATE POLICY "Course owners can view their modules securely" 
ON public.course_modules 
FOR SELECT 
USING (user_owns_course_secure(course_id));

CREATE POLICY "Course owners can insert modules securely" 
ON public.course_modules 
FOR INSERT 
WITH CHECK (user_owns_course_secure(course_id));

CREATE POLICY "Course owners can update their modules securely" 
ON public.course_modules 
FOR UPDATE 
USING (user_owns_course_secure(course_id));

CREATE POLICY "Course owners can delete their modules securely" 
ON public.course_modules 
FOR DELETE 
USING (user_owns_course_secure(course_id));