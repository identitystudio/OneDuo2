-- Drop the overly permissive "Service role full access" policy that allows anyone to read
DROP POLICY IF EXISTS "Service role full access" ON public.courses;

-- Drop duplicate/redundant policies to clean up
DROP POLICY IF EXISTS "Block anonymous SELECT on courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can delete their courses by user_id" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update their courses by user_id" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their own courses by email" ON public.courses;

-- Keep only the clean policies:
-- "Service role only" - for backend operations
-- "Users can view own courses" - for authenticated users
-- "Users can update own courses" - for authenticated users  
-- "Users can delete own courses" - for authenticated users
-- "Authenticated users can create courses" - for new course creation