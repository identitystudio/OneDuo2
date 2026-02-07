-- Update the video-uploads bucket to allow larger file uploads (5GB)
-- This enables multi-hour video uploads via TUS resumable protocol
UPDATE storage.buckets 
SET file_size_limit = 5368709120  -- 5GB in bytes
WHERE id = 'video-uploads';

-- Also update any other video-related buckets if they exist
UPDATE storage.buckets 
SET file_size_limit = 5368709120  -- 5GB in bytes
WHERE id IN ('videos', 'uploads');