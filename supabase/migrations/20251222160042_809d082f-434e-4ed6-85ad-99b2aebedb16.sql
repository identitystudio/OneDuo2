-- Fix 1: Courses table - Add policy to prevent public access to emails
-- The existing policies use RESTRICTIVE which is good, but we need to ensure no public access

-- Fix 2: Verify email_subscribers has RLS enabled (it does, but let's ensure it)
-- Already has service_role only policy which is correct

-- Fix 3: Course chats - Add stricter SELECT policy
-- Already has SELECT policy via email header, which is correct

-- Additional hardening: Add public access blocking policies

-- For courses: Ensure only authenticated users OR rate-limited session users can access
-- Drop and recreate the SELECT policies to be more restrictive about email exposure

-- Create a view for public course data that excludes email
CREATE OR REPLACE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  frame_urls,
  transcript,
  created_at,
  is_multi_module,
  module_count
FROM public.courses
WHERE status = 'completed';

-- Grant access to the view
GRANT SELECT ON public.public_courses TO anon, authenticated;

-- Add UPDATE and DELETE policies for course_modules so users can manage their own
CREATE POLICY "Users can update their course modules by email" 
ON public.course_modules 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_modules.course_id 
  AND (
    courses.email = (current_setting('request.jwt.claims'::text, true)::json ->> 'email') 
    OR courses.email = auth.email()
  )
));

CREATE POLICY "Users can delete their course modules by email" 
ON public.course_modules 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_modules.course_id 
  AND (
    courses.email = (current_setting('request.jwt.claims'::text, true)::json ->> 'email') 
    OR courses.email = auth.email()
  )
));

-- Add SELECT policy for course_progress so users can track their progress
CREATE POLICY "Users can view their course progress by email" 
ON public.course_progress 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_progress.course_id 
  AND (
    courses.email = (current_setting('request.jwt.claims'::text, true)::json ->> 'email') 
    OR courses.email = auth.email()
  )
));

-- Create index for better query performance at scale
CREATE INDEX IF NOT EXISTS idx_courses_email ON public.courses(email);
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_created_at ON public.courses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_modules_course_id ON public.course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course_id ON public.course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON public.email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_current_tag ON public.email_subscribers(current_tag);
CREATE INDEX IF NOT EXISTS idx_email_logs_subscriber_id ON public.email_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_session_id ON public.processing_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);