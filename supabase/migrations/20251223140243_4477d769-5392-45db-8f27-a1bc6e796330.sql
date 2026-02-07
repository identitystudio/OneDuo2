-- Fix public_courses view: Add proper RLS policy for public read access
-- This view is intentionally public for AI-readable course pages (CourseView.tsx)
-- It only exposes non-sensitive fields (no email, user_id, storage paths)

-- First, let's check if there's a select policy and add one that allows public read
-- Since public_courses is a VIEW, we need to ensure it's properly configured

-- Create a SELECT policy that allows anyone to read the public_courses view
-- This is intentional since public_courses only exposes safe, non-PII fields
CREATE POLICY "Public courses view is readable by everyone"
ON public.courses
FOR SELECT
TO anon
USING (
  status = 'completed'
);

-- Note: The public_courses VIEW already filters to only expose safe fields:
-- id, title, description, status, transcript, frame_urls, video_duration_seconds, 
-- module_count, is_multi_module, created_at
-- It does NOT expose: email, user_id, storage_path, video_url, error_message, etc.