-- Fix course_chats: Replace overly permissive "Service role full access" with proper service_role check
DROP POLICY IF EXISTS "Service role full access to course_chats" ON public.course_chats;

CREATE POLICY "Service role only for course_chats"
ON public.course_chats
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');