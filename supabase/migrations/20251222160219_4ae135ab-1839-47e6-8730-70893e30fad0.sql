-- Fix security vulnerabilities: Replace spoofable header-based auth with proper auth.uid()

-- 1. Add user_id column to courses if not exists and update policies
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON public.courses(user_id);

-- 3. Drop the weak header-based policies on course_chats
DROP POLICY IF EXISTS "Users can create their course chats" ON public.course_chats;
DROP POLICY IF EXISTS "Users can view their course chats" ON public.course_chats;

-- 4. Create stronger policies using auth.uid()
CREATE POLICY "Users can create their course chats via auth" 
ON public.course_chats 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_chats.course_id 
  AND (courses.user_id = auth.uid() OR courses.email = auth.email())
));

CREATE POLICY "Users can view their course chats via auth" 
ON public.course_chats 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_chats.course_id 
  AND (courses.user_id = auth.uid() OR courses.email = auth.email())
));

-- 5. Update course_modules policies to use auth.uid()
DROP POLICY IF EXISTS "Users can view their course modules by email" ON public.course_modules;

CREATE POLICY "Users can view their course modules by auth" 
ON public.course_modules 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM courses 
    WHERE courses.id = course_modules.course_id 
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
  OR auth.role() = 'service_role'
);

-- 6. Update the UPDATE and DELETE policies for course_modules
DROP POLICY IF EXISTS "Users can update their course modules by email" ON public.course_modules;
DROP POLICY IF EXISTS "Users can delete their course modules by email" ON public.course_modules;

CREATE POLICY "Users can update their course modules by auth" 
ON public.course_modules 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM courses 
    WHERE courses.id = course_modules.course_id 
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);

CREATE POLICY "Users can delete their course modules by auth" 
ON public.course_modules 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM courses 
    WHERE courses.id = course_modules.course_id 
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);