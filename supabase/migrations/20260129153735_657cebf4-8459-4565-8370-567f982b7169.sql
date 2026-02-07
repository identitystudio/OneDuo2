-- Increase video-uploads bucket file size limit to 50GB
UPDATE storage.buckets
SET file_size_limit = 53687091200
WHERE id = 'video-uploads';