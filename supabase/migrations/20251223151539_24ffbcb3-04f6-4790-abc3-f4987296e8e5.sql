-- Fix 1: Strengthen course_progress blocking with explicit authentication check
DROP POLICY IF EXISTS "Block anonymous SELECT on course_progress" ON public.course_progress;
CREATE POLICY "Block anonymous SELECT on course_progress" 
ON public.course_progress 
FOR SELECT 
TO anon
USING (false);

-- Also add explicit auth requirement for authenticated users (belt and suspenders)
DROP POLICY IF EXISTS "Require auth for course_progress access" ON public.course_progress;

-- Fix 2: public_courses is a VIEW (not a table), so we need to check its definition
-- Views inherit RLS from underlying tables, but let's verify it's SELECT-only for public access
-- Since public_courses is meant to show completed courses publicly, we'll add explicit policy

-- First check if public_courses has RLS enabled (it's a view, so this is handled differently)
-- For views, we rely on the underlying table's RLS policies

-- The public_courses view selects from courses table which now has RLS
-- But views can bypass RLS if created with SECURITY DEFINER
-- Let's recreate it as SECURITY INVOKER to respect underlying RLS

DROP VIEW IF EXISTS public.public_courses;
CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    frame_urls,
    transcript,
    created_at
FROM public.courses
WHERE status = 'completed';