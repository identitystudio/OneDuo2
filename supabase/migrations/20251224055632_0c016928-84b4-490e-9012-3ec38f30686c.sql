-- Drop the existing INSERT policy that allows any email
DROP POLICY IF EXISTS "Authenticated users can create courses" ON public.courses;

-- Create a more restrictive INSERT policy that requires:
-- 1. User must be authenticated
-- 2. user_id must be their own or null
-- 3. email MUST match their authenticated email (no arbitrary emails)
CREATE POLICY "Authenticated users can create courses with own email" 
ON public.courses 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (user_id = auth.uid() OR user_id IS NULL)
  AND email = auth.email()
);

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update own courses" ON public.courses;

-- Create UPDATE policy that prevents email modification
-- Users can only update their own courses AND cannot change the email field
CREATE POLICY "Users can update own courses without changing email" 
ON public.courses 
FOR UPDATE 
USING (user_owns_course(id))
WITH CHECK (
  user_owns_course(id)
  AND email = (SELECT c.email FROM public.courses c WHERE c.id = courses.id)
);