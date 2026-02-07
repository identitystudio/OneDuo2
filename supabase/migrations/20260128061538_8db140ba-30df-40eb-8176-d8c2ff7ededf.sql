-- Add merged_course_mode column to courses table
-- When TRUE: All modules become chapters in ONE unified PDF with TOC
-- User receives ONE email when entire course is complete (with progress updates during processing)
-- When FALSE (default): Separate artifacts per module, per-module emails

ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS merged_course_mode boolean DEFAULT false;

-- Add send_per_module_emails column for backwards compatibility
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS send_per_module_emails boolean DEFAULT true;

-- Add index for querying merged courses
CREATE INDEX IF NOT EXISTS idx_courses_merged_mode ON public.courses (merged_course_mode) WHERE merged_course_mode = true;

-- Add comment for documentation
COMMENT ON COLUMN public.courses.merged_course_mode IS 'When true, all modules become chapters in ONE unified PDF with Table of Contents. User gets one completion email.';