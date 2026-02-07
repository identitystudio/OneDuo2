-- =====================================================
-- SECURITY HARDENING: Address all identified vulnerabilities
-- =====================================================

-- 1. FIX: email_subscribers table - service_role ONLY (no public access)
-- The current policy with USING(true) allows anyone to read
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Create restrictive policy - ONLY service_role can access
CREATE POLICY "email_subscribers_service_role_only" ON public.email_subscribers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add explicit deny for anon and authenticated
CREATE POLICY "Block non-service access to email_subscribers" ON public.email_subscribers
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 2. FIX: video-uploads storage bucket policies (ensure bucket has proper RLS)
-- Insert bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-uploads', 'video-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Drop any existing policies and recreate properly
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to video-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage video-uploads" ON storage.objects;

-- Only authenticated users can upload videos
CREATE POLICY "Authenticated users can upload videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'video-uploads');

-- Public read access (for processing)
CREATE POLICY "Public read access to video-uploads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'video-uploads');

-- Service role can manage all video-uploads
CREATE POLICY "Service role can manage video-uploads"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'video-uploads')
WITH CHECK (bucket_id = 'video-uploads');

-- 3. FIX: course_progress - strengthen with auth.uid() 
DROP POLICY IF EXISTS "Users can view their course progress by email" ON public.course_progress;

CREATE POLICY "Users can view their course progress securely" ON public.course_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses 
      WHERE courses.id = course_progress.course_id 
      AND (
        courses.user_id = auth.uid() 
        OR (courses.user_id IS NULL AND courses.email = auth.email())
      )
    )
  );

-- 4. FIX: artifact_access_log - mark as properly secured (already service_role only)
-- The existing policy is correct but let's ensure it's explicitly blocking
DROP POLICY IF EXISTS "Service role only for artifact_access_log" ON public.artifact_access_log;

CREATE POLICY "Service role only for artifact_access_log" ON public.artifact_access_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Block non-service access to artifact_access_log" ON public.artifact_access_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);