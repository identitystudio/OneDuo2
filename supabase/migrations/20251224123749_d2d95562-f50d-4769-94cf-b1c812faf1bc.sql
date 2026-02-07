-- Fix Critical Security Issue: email_subscribers table is publicly readable
-- This table contains PII (emails, names) and should NOT be publicly accessible

-- First, ensure RLS is enabled
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Drop any overly permissive policies
DROP POLICY IF EXISTS "Allow public read" ON public.email_subscribers;
DROP POLICY IF EXISTS "Public read access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Enable read for all" ON public.email_subscribers;
DROP POLICY IF EXISTS "Allow all operations" ON public.email_subscribers;

-- Create restrictive policies - service role only for all operations
-- No anonymous or authenticated users should be able to read subscriber data directly
-- All email operations should go through edge functions with service role

CREATE POLICY "Service role only for email_subscribers"
ON public.email_subscribers
FOR ALL
USING (
  (SELECT auth.role()) = 'service_role'
);

-- Fix Critical Security Issue: courses table exposing user emails
-- Courses should only be readable by the owner (matching email) or via share token

-- Ensure RLS is enabled
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Service role only" ON public.courses;
DROP POLICY IF EXISTS "Allow public read" ON public.courses;
DROP POLICY IF EXISTS "Public read access" ON public.courses;

-- Create proper policies for courses
-- 1. Service role can do everything (for edge functions)
CREATE POLICY "courses_service_role_all"
ON public.courses
FOR ALL
USING (
  (SELECT auth.role()) = 'service_role'
);

-- 2. Anonymous users can ONLY read courses with share_enabled=true
CREATE POLICY "courses_public_read_shared_only"
ON public.courses
FOR SELECT
USING (
  share_enabled = true
);

-- Fix the public_courses view - add RLS check for share_enabled
-- Since views inherit RLS from base tables, the courses policies will apply
-- But we should also ensure the view only returns shared courses

-- Drop and recreate the view with explicit share_enabled filter
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  status,
  created_at,
  is_multi_module,
  module_count,
  video_duration_seconds,
  share_token
FROM public.courses
WHERE share_enabled = true;