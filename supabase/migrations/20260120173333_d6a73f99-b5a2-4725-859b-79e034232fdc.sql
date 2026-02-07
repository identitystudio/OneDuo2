-- Add multi-video support columns to course_modules
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS source_videos JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stitched_video_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stitch_status TEXT DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.course_modules.source_videos IS 'Array of source video metadata: [{url, filename, order, duration_seconds, storage_path}]';
COMMENT ON COLUMN public.course_modules.stitched_video_url IS 'URL to concatenated video when module has multiple source videos';
COMMENT ON COLUMN public.course_modules.stitch_status IS 'Status of video stitching: pending, stitching, completed, failed';