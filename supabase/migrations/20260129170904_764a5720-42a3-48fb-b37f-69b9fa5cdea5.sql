-- Add metadata column to video_chunks for storing manifest info
ALTER TABLE public.video_chunks
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;