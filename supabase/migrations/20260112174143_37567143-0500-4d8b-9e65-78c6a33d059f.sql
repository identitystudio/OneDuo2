-- 1. Add unique partial index to prevent duplicate active queue jobs
CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_queue_unique_active 
ON public.processing_queue (course_id, step, status) 
WHERE purged = FALSE;

-- 2. Add canonical_artifact_id column to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS canonical_artifact_id UUID REFERENCES public.transformation_artifacts(id);

-- Create index for artifact lookups
CREATE INDEX IF NOT EXISTS idx_courses_canonical_artifact 
ON public.courses (canonical_artifact_id) 
WHERE canonical_artifact_id IS NOT NULL;