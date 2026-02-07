-- ============================================================
-- ENFORCEMENT LAYER: Triggers & Constraints
-- Make governance violations physically impossible
-- ============================================================

-- Step 1: Add governance columns to existing tables

ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS current_frame_id UUID REFERENCES public.execution_frames(id),
ADD COLUMN IF NOT EXISTS last_constraint_check TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS constraint_status TEXT DEFAULT 'valid' CHECK (constraint_status IN ('valid', 'violated', 'pending_check')),
ADD COLUMN IF NOT EXISTS governance_locked BOOLEAN DEFAULT FALSE;

ALTER TABLE public.processing_queue
ADD COLUMN IF NOT EXISTS initiated_by_frame_id UUID REFERENCES public.execution_frames(id),
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approval_frame_id UUID REFERENCES public.execution_frames(id);

-- Step 2: Create enforcement trigger - prevent invalid failures
-- This trigger prevents marking a course as 'failed' when data extraction actually succeeded.

CREATE OR REPLACE FUNCTION public.prevent_invalid_failure()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_frames BOOLEAN;
  has_transcript BOOLEAN;
BEGIN
  -- Only check when transitioning TO failed status
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    
    -- Check if data actually exists
    has_frames := (NEW.frame_urls IS NOT NULL AND jsonb_array_length(NEW.frame_urls) > 0);
    has_transcript := (NEW.transcript IS NOT NULL AND NEW.transcript != '{}');
    
    -- If data exists, this is a constraint violation (race condition)
    IF has_frames AND has_transcript THEN
      
      -- Log the violation
      INSERT INTO public.constraint_violations (
        entity_type,
        entity_id,
        constraint_name,
        violation_type,
        expected_state,
        actual_state,
        severity
      ) VALUES (
        'course',
        NEW.id,
        'false_failure_with_complete_data',
        'race_condition',
        jsonb_build_object('status', 'processing', 'reason', 'data_exists'),
        jsonb_build_object(
          'status', 'failed', 
          'frame_count', jsonb_array_length(NEW.frame_urls), 
          'has_transcript', TRUE,
          'error_message', NEW.error_message
        ),
        'critical'
      );
      
      -- Block the failure
      RAISE EXCEPTION 'GOVERNANCE VIOLATION: Cannot mark as failed - data extraction completed successfully (% frames, transcript present)', jsonb_array_length(NEW.frame_urls);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_false_failure
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invalid_failure();

-- Step 3: Create logging trigger - all state transitions
-- This trigger logs every state change to state_transitions table.

CREATE OR REPLACE FUNCTION public.log_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_frame_id UUID;
BEGIN
  -- Get or create a frame_id for this transition
  v_frame_id := COALESCE(
    NEW.current_frame_id,
    (SELECT id FROM public.execution_frames 
     WHERE target_entity = TG_TABLE_NAME || ':' || NEW.id::text 
     AND executed = FALSE 
     ORDER BY initiated_at DESC LIMIT 1)
  );
  
  -- If no frame exists, create an ai_execution frame (auto-logged)
  IF v_frame_id IS NULL THEN
    INSERT INTO public.execution_frames (
      frame_type,
      initiated_by,
      target_entity,
      target_operation,
      proposed_state,
      approval_status,
      executed,
      executed_at
    ) VALUES (
      'ai_execution',
      COALESCE(current_setting('request.jwt.claims', true)::json->>'email', 'system'),
      TG_TABLE_NAME || ':' || NEW.id::text,
      CASE 
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change:' || COALESCE(OLD.status, 'null') || '->' || NEW.status
        ELSE 'data_update'
      END,
      row_to_json(NEW)::jsonb,
      'approved',
      TRUE,
      now()
    ) RETURNING id INTO v_frame_id;
  END IF;

  -- Log the transition
  INSERT INTO public.state_transitions (
    frame_id,
    entity_type,
    entity_id,
    from_state,
    to_state,
    transition_type,
    triggered_by
  ) VALUES (
    v_frame_id,
    TG_TABLE_NAME,
    NEW.id,
    CASE WHEN OLD IS NULL THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END,
    row_to_json(NEW)::jsonb,
    CASE 
      WHEN OLD IS NULL THEN 'insert'
      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change'
      ELSE 'data_update'
    END,
    COALESCE(current_setting('request.jwt.claims', true)::json->>'email', 'system')
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_course_transitions
  AFTER UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.log_state_transition();

CREATE TRIGGER log_queue_transitions
  AFTER UPDATE ON public.processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.log_state_transition();

-- Step 4: Create constraint check for approval requirements
-- This trigger enforces that jobs requiring approval cannot be claimed without an approved frame.

CREATE OR REPLACE FUNCTION public.enforce_approval_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if job requires approval and is being claimed
  IF NEW.requires_approval = TRUE 
     AND NEW.status = 'processing' 
     AND OLD.status = 'pending' 
     AND NEW.approval_frame_id IS NULL THEN
    
    RAISE EXCEPTION 'GOVERNANCE VIOLATION: Job requires approval frame before processing';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_queue_approval
  BEFORE UPDATE ON public.processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_gate();