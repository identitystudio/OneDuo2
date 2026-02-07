-- =============================================
-- COMPREHENSIVE SECURITY HARDENING MIGRATION
-- =============================================

-- 1. EMAIL HASHING FOR COURSES TABLE
-- Add email_hash column for secure lookups
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS email_hash TEXT;

-- Create index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_courses_email_hash ON public.courses(email_hash);

-- Create function to hash emails consistently
CREATE OR REPLACE FUNCTION public.hash_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(sha256(lower(trim(p_email))::bytea), 'hex')
$$;

-- Create trigger to auto-hash emails on insert/update
CREATE OR REPLACE FUNCTION public.courses_hash_email_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email_hash := public.hash_email(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS courses_email_hash_trigger ON public.courses;
CREATE TRIGGER courses_email_hash_trigger
BEFORE INSERT OR UPDATE OF email ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.courses_hash_email_trigger();

-- Backfill existing rows
UPDATE public.courses SET email_hash = public.hash_email(email) WHERE email_hash IS NULL;

-- Create secure function for email-based ownership check (uses hash)
CREATE OR REPLACE FUNCTION public.user_owns_course_by_hash(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND (
        user_id = auth.uid()
        OR email_hash = public.hash_email(auth.email())
      )
  )
$$;

-- 2. LOCK DOWN SYSTEM_SETTINGS TABLE
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can read system settings" ON public.system_settings;

-- Create service-role only policy
CREATE POLICY "Service role only for system_settings"
ON public.system_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 3. FIX PUBLIC_COURSES VIEW - Remove sensitive columns
DROP VIEW IF EXISTS public.public_courses;
CREATE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  created_at
FROM public.courses
WHERE status = 'completed';

-- 4. DEAD LETTER QUEUE TABLE
CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'course', 'module', 'event'
  entity_id UUID NOT NULL,
  failure_reason TEXT NOT NULL,
  failure_context JSONB DEFAULT '{}',
  original_payload JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  can_retry BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT, -- 'auto', 'manual', 'watchdog'
  resolution_notes TEXT
);

-- Index for finding retryable items
CREATE INDEX IF NOT EXISTS idx_dlq_retryable ON public.dead_letter_queue(can_retry, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_entity ON public.dead_letter_queue(entity_type, entity_id);

-- Enable RLS on DLQ
ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for dead_letter_queue"
ON public.dead_letter_queue
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Function to add items to DLQ
CREATE OR REPLACE FUNCTION public.add_to_dead_letter_queue(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_failure_reason TEXT,
  p_context JSONB DEFAULT '{}',
  p_can_retry BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  INSERT INTO public.dead_letter_queue (entity_type, entity_id, failure_reason, failure_context, can_retry)
  VALUES (p_entity_type, p_entity_id, p_failure_reason, p_context, p_can_retry)
  RETURNING id INTO v_dlq_id;
  
  RETURN v_dlq_id;
END;
$$;

-- 5. UPLOAD INTEGRITY VERIFICATION
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS upload_checksum TEXT;
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS checksum_verified BOOLEAN DEFAULT false;

-- 6. ARTIFACT SCHEMA VERSIONING
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS artifact_schema_version INTEGER DEFAULT 1;

-- 7. ENHANCED RATE LIMITING
-- Add IP-based rate limiting support
ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS ip_address TEXT;
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON public.rate_limits(ip_address, action_type, window_start);

-- Enhanced rate limit check with IP support
CREATE OR REPLACE FUNCTION public.check_rate_limit_with_ip(
  p_session_id TEXT,
  p_ip_address TEXT,
  p_action_type TEXT,
  p_max_requests INTEGER DEFAULT 50,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_count INTEGER;
  v_ip_count INTEGER;
  v_window_start TIMESTAMP WITH TIME ZONE;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;
  
  -- Count requests by session
  SELECT COALESCE(SUM(request_count), 0) INTO v_session_count
  FROM public.rate_limits
  WHERE session_id = p_session_id
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  -- Count requests by IP (stricter limit)
  SELECT COALESCE(SUM(request_count), 0) INTO v_ip_count
  FROM public.rate_limits
  WHERE ip_address = p_ip_address
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  -- Both session and IP must be under limit
  RETURN v_session_count < p_max_requests AND v_ip_count < (p_max_requests * 3);
END;
$$;

-- Function to record rate limit with IP
CREATE OR REPLACE FUNCTION public.increment_rate_limit_with_ip(
  p_session_id TEXT,
  p_ip_address TEXT,
  p_action_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rate_limits (session_id, ip_address, action_type, request_count, window_start)
  VALUES (p_session_id, p_ip_address, p_action_type, 1, now());
END;
$$;

-- 8. HEALTH METRICS TABLE
CREATE TABLE IF NOT EXISTS public.health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  tags JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_name ON public.health_metrics(metric_name, recorded_at DESC);

ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for health_metrics"
ON public.health_metrics
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Function to record metrics
CREATE OR REPLACE FUNCTION public.record_metric(
  p_name TEXT,
  p_value NUMERIC,
  p_tags JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.health_metrics (metric_name, metric_value, tags)
  VALUES (p_name, p_value, p_tags);
END;
$$;

-- 9. ARTIFACT ACCESS LOGGING
CREATE TABLE IF NOT EXISTS public.artifact_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  access_type TEXT NOT NULL, -- 'pdf_view', 'pdf_download', 'signed_url'
  accessor_hash TEXT, -- hashed email or session
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifact_access_course ON public.artifact_access_log(course_id, accessed_at DESC);

ALTER TABLE public.artifact_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_access_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for artifact_access_log"
ON public.artifact_access_log
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 10. CLEANUP OLD DATA FUNCTION
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS TABLE(rate_limits_deleted INTEGER, events_deleted INTEGER, dlq_deleted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate_limits INTEGER;
  v_events INTEGER;
  v_dlq INTEGER;
BEGIN
  -- Delete rate limits older than 24 hours
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '24 hours';
  GET DIAGNOSTICS v_rate_limits = ROW_COUNT;
  
  -- Delete processed events older than 30 days
  DELETE FROM public.processing_events WHERE processed_at < now() - interval '30 days';
  GET DIAGNOSTICS v_events = ROW_COUNT;
  
  -- Delete resolved DLQ entries older than 90 days
  DELETE FROM public.dead_letter_queue WHERE resolved_at < now() - interval '90 days';
  GET DIAGNOSTICS v_dlq = ROW_COUNT;
  
  RETURN QUERY SELECT v_rate_limits, v_events, v_dlq;
END;
$$;