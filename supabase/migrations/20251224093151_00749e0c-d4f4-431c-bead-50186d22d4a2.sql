-- Add course_files column to store uploaded supplementary files (PDFs, docs, etc.)
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS course_files jsonb DEFAULT '[]'::jsonb;

-- Add comment explaining the column structure
COMMENT ON COLUMN public.courses.course_files IS 'Array of course-level supplementary files: [{name: string, storagePath: string, size: number, uploadedAt: timestamp}]';