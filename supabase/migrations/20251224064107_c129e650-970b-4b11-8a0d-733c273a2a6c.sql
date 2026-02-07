-- ============================================================
-- Batch Upload Infrastructure: Robust module processing with 
-- idempotent steps, atomic state transitions, and per-module emails
-- ============================================================

-- Add batch processing fields to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS batch_id UUID,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Add detailed processing state to course_modules
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS processing_state TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS step_completed JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE;

-- Add constraint for valid processing states
-- States: pending, uploaded, queued, transcribing, extracting, analyzing, pdf_building, completed, failed_retrying, failed_terminal
COMMENT ON COLUMN public.course_modules.processing_state IS 
'Valid states: pending, uploaded, queued, transcribing, extracting, analyzing, pdf_building, completed, failed_retrying, failed_terminal';

-- Create batch_jobs table for tracking batch submissions
CREATE TABLE IF NOT EXISTS public.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  total_modules INTEGER NOT NULL,
  completed_modules INTEGER DEFAULT 0,
  failed_modules INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS on batch_jobs
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for batch_jobs - users can see their own jobs
CREATE POLICY "Users can view their own batch jobs by email" 
  ON public.batch_jobs FOR SELECT 
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Service role can manage batch jobs"
  ON public.batch_jobs FOR ALL
  TO service_role
  USING (true);

-- Create module_processing_steps table for idempotent step tracking
CREATE TABLE IF NOT EXISTS public.module_processing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  output_data JSONB,
  error_message TEXT,
  attempt_number INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(module_id, step_name, attempt_number)
);

-- Enable RLS on module_processing_steps
ALTER TABLE public.module_processing_steps ENABLE ROW LEVEL SECURITY;

-- Service role can manage processing steps
CREATE POLICY "Service role can manage processing steps"
  ON public.module_processing_steps FOR ALL
  TO service_role
  USING (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_module_processing_steps_module 
  ON public.module_processing_steps(module_id);

CREATE INDEX IF NOT EXISTS idx_course_modules_state 
  ON public.course_modules(processing_state);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_email 
  ON public.batch_jobs(user_email);

CREATE INDEX IF NOT EXISTS idx_courses_batch 
  ON public.courses(batch_id);

-- Function to atomically transition module state
CREATE OR REPLACE FUNCTION public.transition_module_state(
  p_module_id UUID,
  p_from_state TEXT,
  p_to_state TEXT,
  p_step_data JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE public.course_modules
  SET 
    processing_state = p_to_state,
    step_completed = COALESCE(step_completed, '{}'::jsonb) || COALESCE(p_step_data, '{}'::jsonb),
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = p_module_id 
    AND processing_state = p_from_state;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Function to check if a step was already completed (idempotency)
CREATE OR REPLACE FUNCTION public.is_step_completed(
  p_module_id UUID,
  p_step_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.module_processing_steps
    WHERE module_id = p_module_id
      AND step_name = p_step_name
      AND status = 'completed'
  );
END;
$$;

-- Function to record step completion
CREATE OR REPLACE FUNCTION public.complete_module_step(
  p_module_id UUID,
  p_step_name TEXT,
  p_output_data JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.module_processing_steps (
    module_id, step_name, status, completed_at, output_data
  ) VALUES (
    p_module_id, p_step_name, 'completed', now(), p_output_data
  )
  ON CONFLICT (module_id, step_name, attempt_number) 
  DO UPDATE SET 
    status = 'completed',
    completed_at = now(),
    output_data = COALESCE(EXCLUDED.output_data, module_processing_steps.output_data);
END;
$$;

-- Function to detect stalled modules (no heartbeat for 5 minutes)
CREATE OR REPLACE FUNCTION public.detect_stalled_modules()
RETURNS TABLE(
  module_id UUID,
  course_id UUID,
  current_state TEXT,
  stalled_since TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id as module_id,
    cm.course_id,
    cm.processing_state as current_state,
    cm.heartbeat_at as stalled_since
  FROM public.course_modules cm
  WHERE cm.processing_state IN ('transcribing', 'extracting', 'analyzing', 'pdf_building')
    AND cm.heartbeat_at < now() - interval '5 minutes';
END;
$$;

-- Function to reset stalled module for retry
CREATE OR REPLACE FUNCTION public.reset_stalled_module(p_module_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retry_count INTEGER;
BEGIN
  SELECT retry_count INTO v_retry_count
  FROM public.course_modules
  WHERE id = p_module_id;
  
  IF v_retry_count >= 3 THEN
    UPDATE public.course_modules
    SET processing_state = 'failed_terminal',
        last_error = 'Max retries exceeded',
        updated_at = now()
    WHERE id = p_module_id;
    RETURN FALSE;
  END IF;
  
  UPDATE public.course_modules
  SET processing_state = 'queued',
      retry_count = retry_count + 1,
      heartbeat_at = now(),
      updated_at = now()
  WHERE id = p_module_id;
  
  RETURN TRUE;
END;
$$;

-- Enable realtime for batch_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.batch_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.module_processing_steps;