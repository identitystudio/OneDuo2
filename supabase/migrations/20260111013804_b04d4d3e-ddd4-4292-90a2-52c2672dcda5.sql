-- Add columns to video_processing_queue for segmentation and resume support
ALTER TABLE public.video_processing_queue
ADD COLUMN IF NOT EXISTS video_duration_seconds numeric,
ADD COLUMN IF NOT EXISTS expected_frames integer,
ADD COLUMN IF NOT EXISTS processed_frames integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS segment_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS completed_segments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS segment_pdfs jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS processing_phase text DEFAULT 'pending';

-- Add comment explaining phases
COMMENT ON COLUMN public.video_processing_queue.processing_phase IS 
'Processing phase: pending -> extracting -> compressing -> pdf_building -> merging -> completed';

COMMENT ON COLUMN public.video_processing_queue.completed_segments IS 
'Array of segment indices that have been completed (for resume support)';

COMMENT ON COLUMN public.video_processing_queue.segment_pdfs IS 
'Array of {segmentIndex, storagePath} for each completed segment PDF';