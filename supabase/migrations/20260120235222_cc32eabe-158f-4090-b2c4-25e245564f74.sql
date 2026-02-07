-- Fix storage RLS policies for course-files bucket to properly allow authenticated users

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can upload course files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read course files" ON storage.objects;

-- Create comprehensive policies for authenticated users using the correct role
CREATE POLICY "Authenticated users can upload to course-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'course-files');

CREATE POLICY "Authenticated users can read from course-files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'course-files');

CREATE POLICY "Authenticated users can update course-files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'course-files')
WITH CHECK (bucket_id = 'course-files');

CREATE POLICY "Authenticated users can delete from course-files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'course-files');