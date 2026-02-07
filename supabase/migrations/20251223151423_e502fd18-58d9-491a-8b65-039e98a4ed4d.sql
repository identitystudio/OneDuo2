-- Fix: Block anonymous access to courses table to protect customer email addresses
-- This prevents unauthenticated users from reading course data including emails

-- Drop any existing anonymous block policy if present
DROP POLICY IF EXISTS "Block anonymous SELECT on courses" ON public.courses;

-- Create policy to explicitly block anonymous SELECT access
CREATE POLICY "Block anonymous SELECT on courses" 
ON public.courses 
FOR SELECT 
TO anon
USING (false);