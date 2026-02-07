-- Fix the courses table exposure issue
-- The courses_public_read_shared_only policy allows reading the entire row including email
-- We need to remove this policy and ensure public access only goes through the public_courses view

-- Drop the problematic policy that exposes all columns
DROP POLICY IF EXISTS "courses_public_read_shared_only" ON public.courses;

-- Keep only the service role and authenticated user policies for the courses table
-- Anonymous users should NOT be able to read courses directly
-- They should use the public_courses view which excludes sensitive fields

-- Ensure the public_courses view is the only way to access shared course data publicly
-- The view already excludes email, team_notification_email, storage_path, etc.