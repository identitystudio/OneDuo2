-- Fix the courses table security issue by revoking anonymous SELECT access
-- and ensuring only authenticated users with matching email can access their own courses

-- First revoke any direct SELECT from anon role
REVOKE SELECT ON public.courses FROM anon;

-- Add a restrictive SELECT policy that requires authentication
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;

CREATE POLICY "Users can view their own courses by email" 
ON public.courses 
FOR SELECT 
USING (
  auth.email() = email 
  OR auth.uid()::text = user_id::text
);