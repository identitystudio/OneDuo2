-- ============================================================
-- Production Hardening: Concurrency Limits, Heartbeats, Watchdog
-- ============================================================

-- Add concurrency tracking table
CREATE TABLE IF NOT EXISTS public.processing_concurrency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  active_jobs INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_email)
);

-- Enable RLS
ALTER TABLE public.processing_concurrency ENABLE ROW LEVEL SECURITY;

-- Service role can manage concurrency
CREATE POLICY "Service role manages concurrency"
  ON public.processing_concurrency FOR ALL
  TO service_role
  USING (true);

-- Global concurrency settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default concurrency limits
INSERT INTO public.system_settings (key, value) VALUES 
  ('concurrency_limits', '{"per_user": 3, "global": 10}'::jsonb),
  ('heartbeat_timeout_seconds', '300'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS on system_settings (read-only for anon)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system settings"
  ON public.system_settings FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage settings"
  ON public.system_settings FOR ALL
  TO service_role
  USING (true);

-- Function to check if user can start new job (respects concurrency limits)
CREATE OR REPLACE FUNCTION public.can_start_job(p_user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_per_user_limit INTEGER;
  v_global_limit INTEGER;
  v_user_active INTEGER;
  v_global_active INTEGER;
BEGIN
  -- Get limits
  SELECT (value->>'per_user')::int, (value->>'global')::int
  INTO v_per_user_limit, v_global_limit
  FROM public.system_settings
  WHERE key = 'concurrency_limits';
  
  -- Default limits if not set
  v_per_user_limit := COALESCE(v_per_user_limit, 3);
  v_global_limit := COALESCE(v_global_limit, 10);
  
  -- Count user's active jobs
  SELECT COALESCE(active_jobs, 0) INTO v_user_active
  FROM public.processing_concurrency
  WHERE user_email = p_user_email;
  
  -- Count global active jobs
  SELECT COALESCE(SUM(active_jobs), 0) INTO v_global_active
  FROM public.processing_concurrency;
  
  RETURN (COALESCE(v_user_active, 0) < v_per_user_limit) 
     AND (COALESCE(v_global_active, 0) < v_global_limit);
END;
$$;

-- Function to increment user's active job count
CREATE OR REPLACE FUNCTION public.increment_active_jobs(p_user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.processing_concurrency (user_email, active_jobs, last_updated)
  VALUES (p_user_email, 1, now())
  ON CONFLICT (user_email) DO UPDATE SET
    active_jobs = processing_concurrency.active_jobs + 1,
    last_updated = now();
END;
$$;

-- Function to decrement user's active job count
CREATE OR REPLACE FUNCTION public.decrement_active_jobs(p_user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.processing_concurrency
  SET active_jobs = GREATEST(0, active_jobs - 1),
      last_updated = now()
  WHERE user_email = p_user_email;
END;
$$;

-- Function to update heartbeat for a module
CREATE OR REPLACE FUNCTION public.update_module_heartbeat(p_module_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.course_modules
  SET heartbeat_at = now()
  WHERE id = p_module_id;
END;
$$;

-- Function to update heartbeat for a course
CREATE OR REPLACE FUNCTION public.update_course_heartbeat(p_course_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.courses
  SET last_heartbeat_at = now()
  WHERE id = p_course_id;
END;
$$;

-- Function to send per-module email only once (idempotent)
CREATE OR REPLACE FUNCTION public.mark_module_email_sent(p_module_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_sent BOOLEAN;
BEGIN
  -- Check if already sent
  SELECT email_sent_at IS NOT NULL INTO v_already_sent
  FROM public.course_modules
  WHERE id = p_module_id;
  
  IF v_already_sent THEN
    RETURN FALSE; -- Already sent, do not send again
  END IF;
  
  -- Mark as sent
  UPDATE public.course_modules
  SET email_sent_at = now()
  WHERE id = p_module_id
    AND email_sent_at IS NULL;
  
  RETURN FOUND; -- Returns true if row was updated (email should be sent)
END;
$$;

-- Function to verify storage upload succeeded
CREATE OR REPLACE FUNCTION public.verify_frame_upload(
  p_module_id UUID,
  p_frame_count INTEGER,
  p_frame_urls JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify we have the expected number of frames
  IF jsonb_array_length(p_frame_urls) < p_frame_count THEN
    RETURN FALSE;
  END IF;
  
  -- Update module with verified frames
  UPDATE public.course_modules
  SET frame_urls = p_frame_urls,
      total_frames = jsonb_array_length(p_frame_urls),
      step_completed = COALESCE(step_completed, '{}'::jsonb) || 
        jsonb_build_object('frames_verified', true, 'verified_at', now())
  WHERE id = p_module_id;
  
  RETURN TRUE;
END;
$$;

-- Watchdog function to detect and repair stalled jobs
CREATE OR REPLACE FUNCTION public.watchdog_repair_stalled()
RETURNS TABLE(
  repaired_count INTEGER,
  terminal_count INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timeout_seconds INTEGER;
  v_repaired INTEGER := 0;
  v_terminal INTEGER := 0;
  v_details JSONB := '[]'::jsonb;
BEGIN
  -- Get timeout setting
  SELECT (value)::int INTO v_timeout_seconds
  FROM public.system_settings
  WHERE key = 'heartbeat_timeout_seconds';
  
  v_timeout_seconds := COALESCE(v_timeout_seconds, 300);
  
  -- Find and repair stalled modules
  WITH stalled AS (
    SELECT id, course_id, module_number, processing_state, retry_count, heartbeat_at
    FROM public.course_modules
    WHERE processing_state IN ('transcribing', 'extracting', 'analyzing', 'pdf_building')
      AND heartbeat_at < now() - (v_timeout_seconds || ' seconds')::interval
  ),
  repairs AS (
    UPDATE public.course_modules cm
    SET 
      processing_state = CASE 
        WHEN cm.retry_count >= 3 THEN 'failed_terminal'
        ELSE 'queued'
      END,
      retry_count = cm.retry_count + 1,
      last_error = 'Stalled - no heartbeat for ' || v_timeout_seconds || ' seconds',
      heartbeat_at = now()
    FROM stalled s
    WHERE cm.id = s.id
    RETURNING cm.id, cm.processing_state, s.retry_count
  )
  SELECT 
    COUNT(*) FILTER (WHERE processing_state = 'queued'),
    COUNT(*) FILTER (WHERE processing_state = 'failed_terminal'),
    jsonb_agg(jsonb_build_object('id', id, 'state', processing_state))
  INTO v_repaired, v_terminal, v_details
  FROM repairs;
  
  RETURN QUERY SELECT v_repaired, v_terminal, v_details;
END;
$$;