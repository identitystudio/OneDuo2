
-- Fix 1: email_subscribers table - already has service_role only policy, but verify RLS is enabled
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Fix 2: courses table - drop ineffective blocking policy and ensure proper RLS
DROP POLICY IF EXISTS "Block anonymous SELECT on courses" ON public.courses;

-- Fix 3: course_progress table - add explicit anonymous block
DROP POLICY IF EXISTS "Block anonymous SELECT on course_progress" ON public.course_progress;
CREATE POLICY "Block anonymous SELECT on course_progress" 
ON public.course_progress 
FOR SELECT 
TO anon
USING (false);

-- Verify course_modules anonymous block exists
DROP POLICY IF EXISTS "Block anonymous SELECT on course_modules" ON public.course_modules;
CREATE POLICY "Block anonymous SELECT on course_modules" 
ON public.course_modules 
FOR SELECT 
TO anon
USING (false);
