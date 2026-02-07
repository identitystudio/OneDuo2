-- Add RLS policies to courses table so users can access their own course data via email

-- Allow users to view their own courses (by email match)
CREATE POLICY "Users can view their own courses by email"
ON public.courses
FOR SELECT
USING (
  email = current_setting('request.jwt.claims', true)::json->>'email'
  OR email = auth.email()
);

-- Allow users to update their own courses
CREATE POLICY "Users can update their own courses by email"
ON public.courses
FOR UPDATE
USING (
  email = current_setting('request.jwt.claims', true)::json->>'email'
  OR email = auth.email()
);

-- Allow users to delete their own courses
CREATE POLICY "Users can delete their own courses by email"
ON public.courses
FOR DELETE
USING (
  email = current_setting('request.jwt.claims', true)::json->>'email'
  OR email = auth.email()
);

-- Allow anyone to insert courses (email is provided at creation)
CREATE POLICY "Anyone can create courses"
ON public.courses
FOR INSERT
WITH CHECK (true);

-- Add DELETE policy to course_chats so users can delete their own messages
CREATE POLICY "Users can delete their own course chats"
ON public.course_chats
FOR DELETE
USING (
  course_id IN (
    SELECT id FROM public.courses
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
    OR email = auth.email()
  )
);