-- Video Chunks Table - Intelligent chunking for long videos
-- Each chunk is a 10-minute segment processed independently

CREATE TABLE public.video_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.course_modules(id) ON DELETE CASCADE,
  
  -- Chunk identity
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  
  -- Time boundaries
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  duration_seconds INTEGER GENERATED ALWAYS AS (end_seconds - start_seconds) STORED,
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'merged')),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  
  -- Results
  frame_urls JSONB DEFAULT '[]'::jsonb,
  frame_count INTEGER DEFAULT 0,
  transcript JSONB,
  artifact_data JSONB,
  pdf_storage_path TEXT,
  
  -- Worker tracking
  worker_id TEXT,
  locked_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint: no duplicate chunks per course/module
  UNIQUE (course_id, module_id, chunk_index)
);

-- Enable RLS
ALTER TABLE public.video_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow service role full access, users can view their own
CREATE POLICY "Service role can manage all chunks" 
ON public.video_chunks 
FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can view their course chunks" 
ON public.video_chunks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.courses c 
    WHERE c.id = video_chunks.course_id 
    AND c.user_id = auth.uid()
  )
);

-- Indexes for efficient querying
CREATE INDEX idx_video_chunks_course_id ON public.video_chunks(course_id);
CREATE INDEX idx_video_chunks_module_id ON public.video_chunks(module_id);
CREATE INDEX idx_video_chunks_status ON public.video_chunks(status);
CREATE INDEX idx_video_chunks_pending ON public.video_chunks(course_id, status) WHERE status = 'pending';
CREATE INDEX idx_video_chunks_processing ON public.video_chunks(course_id, status) WHERE status = 'processing';

-- Add chunk tracking columns to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS chunked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chunk_count INTEGER,
ADD COLUMN IF NOT EXISTS completed_chunks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chunking_strategy TEXT,
ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER;

-- Add chunk tracking columns to course_modules table  
ALTER TABLE public.course_modules
ADD COLUMN IF NOT EXISTS chunked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chunk_count INTEGER,
ADD COLUMN IF NOT EXISTS completed_chunks INTEGER DEFAULT 0;

-- Add to video_processing_queue for chunk-aware processing
ALTER TABLE public.video_processing_queue
ADD COLUMN IF NOT EXISTS is_chunk BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES public.video_chunks(id),
ADD COLUMN IF NOT EXISTS parent_job_id TEXT;

-- Function to update chunk progress on courses
CREATE OR REPLACE FUNCTION update_chunk_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Update course completed_chunks count
    IF NEW.course_id IS NOT NULL THEN
      UPDATE courses 
      SET completed_chunks = (
        SELECT COUNT(*) FROM video_chunks 
        WHERE course_id = NEW.course_id AND status = 'completed'
      ),
      updated_at = now()
      WHERE id = NEW.course_id;
    END IF;
    
    -- Update module completed_chunks count
    IF NEW.module_id IS NOT NULL THEN
      UPDATE course_modules 
      SET completed_chunks = (
        SELECT COUNT(*) FROM video_chunks 
        WHERE module_id = NEW.module_id AND status = 'completed'
      ),
      updated_at = now()
      WHERE id = NEW.module_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to auto-update progress
CREATE TRIGGER trg_update_chunk_progress
AFTER UPDATE ON public.video_chunks
FOR EACH ROW
EXECUTE FUNCTION update_chunk_progress();

-- Function to check if all chunks are complete and merge is needed
CREATE OR REPLACE FUNCTION check_chunks_complete(p_course_id UUID, p_module_id UUID DEFAULT NULL)
RETURNS TABLE(
  all_complete BOOLEAN,
  total_chunks INTEGER,
  completed_chunks INTEGER,
  failed_chunks INTEGER
) AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
  v_failed INTEGER;
BEGIN
  IF p_module_id IS NOT NULL THEN
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_total, v_completed, v_failed
    FROM video_chunks
    WHERE module_id = p_module_id;
  ELSE
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_total, v_completed, v_failed
    FROM video_chunks
    WHERE course_id = p_course_id;
  END IF;
  
  RETURN QUERY SELECT 
    (v_completed = v_total AND v_total > 0) AS all_complete,
    v_total AS total_chunks,
    v_completed AS completed_chunks,
    v_failed AS failed_chunks;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Comment
COMMENT ON TABLE public.video_chunks IS 'Stores 10-minute video segments for parallel processing of long videos (30+ minutes)';
COMMENT ON COLUMN public.video_chunks.chunk_index IS 'Zero-based index of this chunk within the video';
COMMENT ON COLUMN public.video_chunks.artifact_data IS 'Partial artifact data for this chunk (frames, transcript segment, etc.)';