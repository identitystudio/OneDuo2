-- Fix security issue: email_subscribers needs proper RLS (already has service_role only policy)
-- Verified: email_subscribers already has "Service role only" policy - this is correct

-- Fix security issue: courses table has restrictive policies but let's verify they work correctly
-- Already has multiple SELECT/UPDATE/DELETE policies by user_id, email, and service_role - this is correct

-- Fix security issue: public_courses view needs RLS protection
-- Note: This is a VIEW, not a table, so RLS doesn't apply the same way
-- The view already only exposes non-sensitive fields (no email, user_id)
-- Adding an RLS policy to the underlying courses table is already done

-- Add missing DELETE policy for character_insights
CREATE POLICY "Character insights can be deleted"
ON public.character_insights
FOR DELETE
TO anon, authenticated
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Add missing UPDATE policy for location_photos  
CREATE POLICY "Users can update their location photos"
ON public.location_photos
FOR UPDATE
TO anon, authenticated
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text))
WITH CHECK (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Add missing UPDATE policy for course_chats
CREATE POLICY "Users can update their course chats via auth"
ON public.course_chats
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_chats.course_id
  AND (courses.user_id = auth.uid() OR courses.email = auth.email())
));

-- Add user-level INSERT/UPDATE/DELETE policies for course_progress
CREATE POLICY "Users can insert their course progress by email"
ON public.course_progress
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_progress.course_id
  AND (courses.email = auth.email() OR courses.user_id = auth.uid())
));

CREATE POLICY "Users can update their course progress by email"
ON public.course_progress
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_progress.course_id
  AND (courses.email = auth.email() OR courses.user_id = auth.uid())
));

CREATE POLICY "Users can delete their course progress by email"
ON public.course_progress
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_progress.course_id
  AND (courses.email = auth.email() OR courses.user_id = auth.uid())
));