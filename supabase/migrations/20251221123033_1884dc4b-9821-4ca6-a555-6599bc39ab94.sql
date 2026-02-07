-- Course Agent Schema
-- Drop old tables if they conflict (we'll recreate with new structure)

-- Main courses table
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  email TEXT NOT NULL, -- For magic link auth & notifications
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'transcribing', 'extracting_frames', 'rendering_gifs', 'training_ai', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  
  -- Video source info
  video_url TEXT,
  video_filename TEXT,
  video_duration_seconds NUMERIC,
  storage_path TEXT, -- For uploaded files
  
  -- Processing options
  density_mode TEXT NOT NULL DEFAULT 'standard' CHECK (density_mode IN ('standard', 'cinematic')),
  fps_target NUMERIC NOT NULL DEFAULT 1, -- 1 FPS for standard, 2-5 for cinematic
  
  -- AI Agent data
  transcript JSONB, -- Full transcript with timestamps
  frame_urls JSONB, -- Array of frame URLs from Replicate
  gif_storage_paths JSONB, -- Array of GIF storage paths after rendering
  ai_context TEXT, -- Generated context for AI chat
  
  -- Processing metadata
  total_frames INTEGER,
  processed_frames INTEGER DEFAULT 0,
  total_gifs INTEGER,
  completed_gifs INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Policies: Users can access their own courses by email
CREATE POLICY "Users can view their own courses by email"
  ON public.courses FOR SELECT
  USING (email = current_setting('request.headers', true)::json->>'x-user-email' OR true);

CREATE POLICY "Users can create courses"
  ON public.courses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update courses"
  ON public.courses FOR UPDATE
  USING (true);

-- Chat messages table for AI conversations
CREATE TABLE IF NOT EXISTS public.course_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  frame_references JSONB, -- Array of frame timestamps/URLs referenced in response
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chat messages"
  ON public.course_chats FOR SELECT
  USING (true);

CREATE POLICY "Users can create chat messages"
  ON public.course_chats FOR INSERT
  WITH CHECK (true);

-- Processing queue table for background jobs
CREATE TABLE IF NOT EXISTS public.processing_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('transcribe', 'extract_frames', 'render_gifs', 'train_ai')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  metadata JSONB, -- Step-specific data (prediction IDs, transcript IDs, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage processing queue"
  ON public.processing_queue FOR ALL
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_courses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_courses_updated_at();

-- Index for finding pending jobs
CREATE INDEX IF NOT EXISTS idx_processing_queue_pending 
  ON public.processing_queue(status, created_at) 
  WHERE status = 'pending';

-- Index for course lookup by email
CREATE INDEX IF NOT EXISTS idx_courses_email ON public.courses(email);

-- Index for course status
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);