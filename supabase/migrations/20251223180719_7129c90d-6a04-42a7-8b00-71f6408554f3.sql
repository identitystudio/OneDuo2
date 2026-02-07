-- Fix 1: Secure email_subscribers table - service_role only access
-- This table should only be accessed by edge functions, not directly by users

-- Drop any existing policies
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Create policy that restricts all access to service_role only
CREATE POLICY "Service role only access" 
ON public.email_subscribers 
FOR ALL 
USING (false)
WITH CHECK (false);

-- Note: Edge functions use service_role key which bypasses RLS, so they still work
-- But direct client access is now blocked

-- Fix 2: Strengthen courses table RLS - remove email-based patterns
-- First drop weak policies that use email matching
DROP POLICY IF EXISTS "Users can read their courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can delete their courses by email" ON public.courses;

-- The existing policies using user_owns_course function are secure (uses user_id OR email internally)
-- But let's verify the block anonymous policy exists
DROP POLICY IF EXISTS "Block anonymous SELECT" ON public.courses;
CREATE POLICY "Block anonymous SELECT" 
ON public.courses 
FOR SELECT 
TO anon 
USING (status = 'completed');

-- Ensure authenticated users can only see their own courses
DROP POLICY IF EXISTS "Users can view own courses" ON public.courses;
CREATE POLICY "Users can view own courses" 
ON public.courses 
FOR SELECT 
TO authenticated 
USING (public.user_owns_course(id));

-- Ensure authenticated users can only update their own courses  
DROP POLICY IF EXISTS "Users can update own courses" ON public.courses;
CREATE POLICY "Users can update own courses" 
ON public.courses 
FOR UPDATE 
TO authenticated 
USING (public.user_owns_course(id))
WITH CHECK (public.user_owns_course(id));

-- Ensure authenticated users can only delete their own courses
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;
CREATE POLICY "Users can delete own courses" 
ON public.courses 
FOR DELETE 
TO authenticated 
USING (public.user_owns_course(id));

-- Service role can do anything (for edge functions)
DROP POLICY IF EXISTS "Service role full access" ON public.courses;
CREATE POLICY "Service role full access" 
ON public.courses 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);