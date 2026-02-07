-- Fix 1: email_subscribers table - it's service_role only which is correct
-- The warning is a false positive - checking the actual RLS policy shows it's already protected
-- Let's verify and strengthen it

-- Ensure RLS is enabled (it already is)
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- The existing policy "Service role only" restricts all access to service_role
-- This is correct - no public access. The scanner may be confused.
-- Let's explicitly revoke any public access to be extra safe
REVOKE ALL ON public.email_subscribers FROM anon;
REVOKE ALL ON public.email_subscribers FROM authenticated;

-- Fix 2: Strengthen course_chats RLS policies
-- Drop existing policies and recreate with simpler, more robust checks

DROP POLICY IF EXISTS "Users can view their course chats via auth" ON public.course_chats;
DROP POLICY IF EXISTS "Users can create their course chats via auth" ON public.course_chats;
DROP POLICY IF EXISTS "Users can update their course chats via auth" ON public.course_chats;
DROP POLICY IF EXISTS "Users can delete their own course chats" ON public.course_chats;

-- Create a security definer function to safely check course ownership
CREATE OR REPLACE FUNCTION public.user_owns_course(p_course_id uuid)
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
      AND (user_id = auth.uid() OR email = auth.email())
  )
$$;

-- Recreate policies using the security definer function
CREATE POLICY "Users can view their course chats"
ON public.course_chats
FOR SELECT
TO authenticated
USING (public.user_owns_course(course_id));

CREATE POLICY "Users can create their course chats"
ON public.course_chats
FOR INSERT
TO authenticated
WITH CHECK (public.user_owns_course(course_id));

CREATE POLICY "Users can update their course chats"
ON public.course_chats
FOR UPDATE
TO authenticated
USING (public.user_owns_course(course_id));

CREATE POLICY "Users can delete their course chats"
ON public.course_chats
FOR DELETE
TO authenticated
USING (public.user_owns_course(course_id));

-- Also add service role access for edge functions
CREATE POLICY "Service role full access to course_chats"
ON public.course_chats
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);