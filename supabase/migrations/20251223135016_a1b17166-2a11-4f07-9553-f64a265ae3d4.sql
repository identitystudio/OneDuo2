-- Fix storage bucket security: restrict write access to service role only
-- First drop the insecure policies

DROP POLICY IF EXISTS "Allow public upload to course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to course-gifs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from course-gifs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to course-gifs" ON storage.objects;

-- Create secure policies that only allow service role to write/delete
-- Public read is still allowed since buckets are public

CREATE POLICY "Service role can upload to course-videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-videos' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update course-videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-videos' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete from course-videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-videos' AND auth.role() = 'service_role');

CREATE POLICY "Service role can upload to course-gifs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-gifs' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update course-gifs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-gifs' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete from course-gifs"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-gifs' AND auth.role() = 'service_role');