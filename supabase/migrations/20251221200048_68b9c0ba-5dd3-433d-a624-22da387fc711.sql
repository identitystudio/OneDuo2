-- Create storage bucket for course videos
INSERT INTO storage.buckets (id, name, public) VALUES ('course-videos', 'course-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for course GIFs
INSERT INTO storage.buckets (id, name, public) VALUES ('course-gifs', 'course-gifs', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for course-videos bucket
CREATE POLICY "Allow public read access to course-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-videos');

CREATE POLICY "Allow public upload to course-videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-videos');

CREATE POLICY "Allow public update to course-videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-videos');

CREATE POLICY "Allow public delete from course-videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-videos');

-- Create policies for course-gifs bucket
CREATE POLICY "Allow public read access to course-gifs"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-gifs');

CREATE POLICY "Allow public upload to course-gifs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-gifs');

CREATE POLICY "Allow public update to course-gifs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-gifs');

CREATE POLICY "Allow public delete from course-gifs"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-gifs');