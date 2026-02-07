-- Create storage bucket for course-level files (PDFs, docs, etc.)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('course-files', 'course-files', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload course files
CREATE POLICY "Authenticated users can upload course files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-files' 
  AND auth.uid() IS NOT NULL
);

-- Allow users to download their own course files (service role only for now)
CREATE POLICY "Service role can manage course files"
ON storage.objects FOR ALL
USING (bucket_id = 'course-files' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'course-files' AND auth.role() = 'service_role');

-- Allow authenticated users to read course files
CREATE POLICY "Authenticated users can read course files"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-files' AND auth.uid() IS NOT NULL);