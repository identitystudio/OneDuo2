-- Add progress tracking columns to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS progress_step text DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS estimated_completion_time timestamptz;

-- Add progress tracking columns to course_modules table
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS progress_step text DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS estimated_completion_time timestamptz;

-- Add constraint for valid progress steps
ALTER TABLE public.courses 
ADD CONSTRAINT valid_progress_step CHECK (
  progress_step IS NULL OR progress_step IN (
    'uploading', 'queued', 'extracting_frames', 'transcribing', 
    'analyzing', 'generating_artifact', 'finalizing', 'completed', 'failed'
  )
);

ALTER TABLE public.course_modules 
ADD CONSTRAINT valid_module_progress_step CHECK (
  progress_step IS NULL OR progress_step IN (
    'uploading', 'queued', 'extracting_frames', 'transcribing', 
    'analyzing', 'generating_artifact', 'finalizing', 'completed', 'failed'
  )
);