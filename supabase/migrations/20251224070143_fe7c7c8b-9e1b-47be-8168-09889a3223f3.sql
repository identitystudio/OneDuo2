-- Module processing leases (prevent duplicate processing)
CREATE TABLE IF NOT EXISTS public.module_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL UNIQUE,
  course_id UUID NOT NULL,
  worker_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for module_leases
ALTER TABLE public.module_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages leases" ON public.module_leases
  FOR ALL USING (auth.role() = 'service_role');

-- Event outbox for reliable event processing
CREATE TABLE IF NOT EXISTS public.processing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'module_completed', 'batch_completed', 'processing_failed'
  entity_type TEXT NOT NULL, -- 'module', 'course', 'batch'
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for processing_events
ALTER TABLE public.processing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages events" ON public.processing_events
  FOR ALL USING (auth.role() = 'service_role');

-- Index for efficient event polling
CREATE INDEX IF NOT EXISTS idx_processing_events_unprocessed 
  ON public.processing_events(created_at) 
  WHERE processed_at IS NULL;

-- Acquire lease function (returns true if acquired, false if already held)
CREATE OR REPLACE FUNCTION public.acquire_module_lease(
  p_module_id UUID,
  p_course_id UUID,
  p_worker_id TEXT,
  p_lease_duration_seconds INTEGER DEFAULT 300
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired BOOLEAN;
BEGIN
  -- Clean up expired leases first
  DELETE FROM public.module_leases 
  WHERE module_id = p_module_id 
    AND expires_at < now() 
    AND released_at IS NULL;
  
  -- Try to insert new lease
  INSERT INTO public.module_leases (module_id, course_id, worker_id, expires_at)
  VALUES (p_module_id, p_course_id, p_worker_id, now() + (p_lease_duration_seconds || ' seconds')::interval)
  ON CONFLICT (module_id) DO NOTHING;
  
  -- Check if we got the lease
  SELECT EXISTS (
    SELECT 1 FROM public.module_leases 
    WHERE module_id = p_module_id 
      AND worker_id = p_worker_id 
      AND released_at IS NULL
  ) INTO v_acquired;
  
  RETURN v_acquired;
END;
$$;

-- Renew lease function (extend expiry while holding)
CREATE OR REPLACE FUNCTION public.renew_module_lease(
  p_module_id UUID,
  p_worker_id TEXT,
  p_lease_duration_seconds INTEGER DEFAULT 300
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.module_leases
  SET expires_at = now() + (p_lease_duration_seconds || ' seconds')::interval
  WHERE module_id = p_module_id 
    AND worker_id = p_worker_id 
    AND released_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Release lease function
CREATE OR REPLACE FUNCTION public.release_module_lease(
  p_module_id UUID,
  p_worker_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.module_leases
  SET released_at = now()
  WHERE module_id = p_module_id 
    AND worker_id = p_worker_id 
    AND released_at IS NULL;
END;
$$;

-- Emit event to outbox
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
BEGIN
  INSERT INTO public.processing_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, p_payload)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Process event (mark as handled)
CREATE OR REPLACE FUNCTION public.mark_event_processed(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.processing_events
  SET processed_at = now()
  WHERE id = p_event_id AND processed_at IS NULL;
END;
$$;

-- Get unprocessed events
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
  LIMIT p_limit;
END;
$$;