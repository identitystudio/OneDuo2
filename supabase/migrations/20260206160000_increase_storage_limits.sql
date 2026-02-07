-- Increase maximum file size for storage buckets to 50GB
-- 50GB = 53,687,091,200 bytes

-- Ensure storage buckets exist (Supabase current schema compatible)

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('video-uploads', 'video-uploads', true),
  ('course-files', 'course-files', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;
