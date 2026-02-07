-- Drop existing policies that use the less secure function
DROP POLICY IF EXISTS "Users can view own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update own courses without changing email" ON public.courses;

-- Recreate policies using the stricter user_owns_course_secure function
CREATE POLICY "Users can view own courses securely"
ON public.courses
FOR SELECT
TO authenticated
USING (user_owns_course_secure(id));

CREATE POLICY "Users can delete own courses securely"
ON public.courses
FOR DELETE
TO authenticated
USING (user_owns_course_secure(id));

CREATE POLICY "Users can update own courses securely"
ON public.courses
FOR UPDATE
TO authenticated
USING (user_owns_course_secure(id))
WITH CHECK (
  user_owns_course_secure(id) 
  AND email = (SELECT c.email FROM courses c WHERE c.id = courses.id)
);