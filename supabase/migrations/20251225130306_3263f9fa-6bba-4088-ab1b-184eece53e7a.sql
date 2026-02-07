-- Final hardening: Remove NULL user_id fallback vulnerability
-- Create a security definer function for strict course ownership

-- Update the strict course SELECT policy to use user_id ONLY (no email fallback)
DROP POLICY IF EXISTS "Strict user owns course SELECT" ON public.courses;

CREATE POLICY "Strict user owns course SELECT"
ON public.courses
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- For legacy courses without user_id, they will need to be migrated
-- Users can still access their own data via the user_owns_course_secure function in update/delete policies

-- Also tighten support_conversations to user_id only
DROP POLICY IF EXISTS "Users can only see own support conversations" ON public.support_conversations;

CREATE POLICY "Strict support conversation ownership"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());