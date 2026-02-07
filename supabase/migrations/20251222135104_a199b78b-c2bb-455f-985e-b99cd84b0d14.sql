-- Create course_modules table for multi-video courses
CREATE TABLE public.course_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  video_duration_seconds NUMERIC,
  transcript JSONB,
  frame_urls JSONB,
  gif_storage_paths JSONB,
  total_frames INTEGER,
  completed_gifs INTEGER DEFAULT 0,
  total_gifs INTEGER,
  ai_context TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(course_id, module_number)
);

-- Create error_logs table for tracking failures and auto-fix attempts
CREATE TABLE public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.course_modules(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL, -- network, rate_limit, format, api_quota, unknown
  error_message TEXT NOT NULL,
  step TEXT NOT NULL, -- transcribe, extract_frames, render_gifs, train_ai
  fix_strategy TEXT,
  fix_attempted BOOLEAN NOT NULL DEFAULT false,
  fix_succeeded BOOLEAN,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add columns to courses for multi-module support
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS module_count INTEGER DEFAULT 1;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS completed_modules INTEGER DEFAULT 0;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_multi_module BOOLEAN DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS last_fix_strategy TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS fix_attempts INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for course_modules
CREATE POLICY "Service role full access to course_modules" 
ON public.course_modules 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view their course modules by email" 
ON public.course_modules 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_modules.course_id 
  AND (courses.email = (current_setting('request.jwt.claims', true)::json->>'email') OR courses.email = auth.email())
));

-- RLS policies for error_logs (service role only for writes)
CREATE POLICY "Service role full access to error_logs" 
ON public.error_logs 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create index for faster lookups
CREATE INDEX idx_course_modules_course_id ON public.course_modules(course_id);
CREATE INDEX idx_error_logs_course_id ON public.error_logs(course_id);
CREATE INDEX idx_error_logs_error_type ON public.error_logs(error_type);

-- Trigger for updated_at
CREATE TRIGGER update_course_modules_updated_at
BEFORE UPDATE ON public.course_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();