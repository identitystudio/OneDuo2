-- Fix email spam when videos are stalled
-- Root cause: no idempotency on course completion/failure emails,
-- no row locking on event dequeuing, no dedup on event emission

-- 1) Add email tracking columns to courses table for idempotent email sending
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS completion_email_sent_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS failure_email_sent_at TIMESTAMP WITH TIME ZONE;

-- 2) Idempotent RPC to mark course completion email as sent (mirrors mark_module_email_sent)
CREATE OR REPLACE FUNCTION public.mark_course_email_sent(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atomic check-and-set: only updates if not already sent
  UPDATE public.courses
  SET completion_email_sent_at = now()
  WHERE id = p_course_id
    AND completion_email_sent_at IS NULL;

  RETURN FOUND; -- true = email should be sent, false = already sent
END;
$$;

-- 2b) Idempotent RPC to mark course failure email as sent
CREATE OR REPLACE FUNCTION public.mark_course_failure_email_sent(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.courses
  SET failure_email_sent_at = now()
  WHERE id = p_course_id
    AND failure_email_sent_at IS NULL;

  RETURN FOUND;
END;
$$;

-- 3) Fix get_pending_events to use FOR UPDATE SKIP LOCKED
-- This prevents multiple concurrent callers from processing the same events
CREATE OR REPLACE FUNCTION public.get_pending_events(p_limit INTEGER DEFAULT 100)
RETURNS TABLE(
  id UUID,
  event_type TEXT,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.event_type, e.entity_type, e.entity_id, e.payload, e.created_at
  FROM public.processing_events e
  WHERE e.processed_at IS NULL
  ORDER BY e.created_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
END;
$$;

-- 4) Fix emit_processing_event to deduplicate: skip if unprocessed event already exists
CREATE OR REPLACE FUNCTION public.emit_processing_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_payload JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_existing_id UUID;
BEGIN
  -- Check for existing unprocessed event of same type for same entity
  SELECT e.id INTO v_existing_id
  FROM public.processing_events e
  WHERE e.event_type = p_event_type
    AND e.entity_id = p_entity_id
    AND e.processed_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Already have an unprocessed event, return existing ID (no duplicate)
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.processing_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, p_payload)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;
