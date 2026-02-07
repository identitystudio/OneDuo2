-- API Keys table for programmatic access
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  rate_limit_per_hour INTEGER DEFAULT 100,
  credits_remaining INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- API Usage Log for tracking and billing
CREATE TABLE public.api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  job_id UUID,
  endpoint TEXT NOT NULL,
  video_duration_seconds INTEGER,
  cost_cents INTEGER,
  request_metadata JSONB DEFAULT '{}',
  response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API Jobs table to track API-initiated jobs
CREATE TABLE public.api_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  callback_url TEXT,
  client_metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  progress_step TEXT,
  artifact_url TEXT,
  pdf_url TEXT,
  error_message TEXT,
  callback_sent_at TIMESTAMPTZ,
  callback_response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_keys
CREATE POLICY "Users can view their own API keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
  ON public.api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for api_usage_log (read-only for users via their keys)
CREATE POLICY "Users can view usage for their API keys"
  ON public.api_usage_log FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for api_jobs
CREATE POLICY "Users can view their API jobs"
  ON public.api_jobs FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

-- Function to check API rate limit
CREATE OR REPLACE FUNCTION public.check_api_rate_limit(p_api_key_id UUID)
RETURNS TABLE(allowed BOOLEAN, requests_used INTEGER, limit_value INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate_limit INTEGER;
  v_requests_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := date_trunc('hour', now());
  
  -- Get rate limit for this key
  SELECT rate_limit_per_hour INTO v_rate_limit
  FROM public.api_keys
  WHERE id = p_api_key_id AND active = true;
  
  IF v_rate_limit IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, now();
    RETURN;
  END IF;
  
  -- Count requests in current hour
  SELECT COUNT(*)::INTEGER INTO v_requests_count
  FROM public.api_usage_log
  WHERE api_key_id = p_api_key_id
    AND created_at >= v_window_start;
  
  RETURN QUERY SELECT 
    (v_requests_count < v_rate_limit),
    v_requests_count,
    v_rate_limit,
    v_window_start + interval '1 hour';
END;
$$;

-- Function to validate API key and get key info
CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash TEXT)
RETURNS TABLE(
  key_id UUID,
  user_id UUID,
  key_name TEXT,
  is_active BOOLEAN,
  rate_limit INTEGER,
  credits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update last_used_at
  UPDATE public.api_keys
  SET last_used_at = now()
  WHERE key_hash = p_key_hash AND active = true;
  
  RETURN QUERY
  SELECT 
    ak.id,
    ak.user_id,
    ak.name,
    ak.active,
    ak.rate_limit_per_hour,
    ak.credits_remaining
  FROM public.api_keys ak
  WHERE ak.key_hash = p_key_hash;
END;
$$;

-- Function to log API usage
CREATE OR REPLACE FUNCTION public.log_api_usage(
  p_api_key_id UUID,
  p_job_id UUID,
  p_endpoint TEXT,
  p_video_duration INTEGER DEFAULT NULL,
  p_cost_cents INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_response_status INTEGER DEFAULT 200
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.api_usage_log (
    api_key_id, job_id, endpoint, video_duration_seconds, 
    cost_cents, request_metadata, response_status
  )
  VALUES (
    p_api_key_id, p_job_id, p_endpoint, p_video_duration,
    p_cost_cents, p_metadata, p_response_status
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Indexes for performance
CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_usage_log_api_key_id ON public.api_usage_log(api_key_id);
CREATE INDEX idx_api_usage_log_created_at ON public.api_usage_log(created_at);
CREATE INDEX idx_api_jobs_api_key_id ON public.api_jobs(api_key_id);
CREATE INDEX idx_api_jobs_course_id ON public.api_jobs(course_id);
CREATE INDEX idx_api_jobs_status ON public.api_jobs(status);

-- Trigger to update api_jobs.updated_at
CREATE TRIGGER update_api_jobs_updated_at
  BEFORE UPDATE ON public.api_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();