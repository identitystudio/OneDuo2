-- Add module_files column to course_modules to store per-module supplementary files
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS module_files JSONB DEFAULT '[]'::jsonb;