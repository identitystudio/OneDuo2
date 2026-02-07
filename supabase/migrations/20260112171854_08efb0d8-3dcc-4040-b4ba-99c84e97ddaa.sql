-- Fix log_state_transition trigger to handle tables without current_frame_id column
CREATE OR REPLACE FUNCTION public.log_state_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_frame_id UUID;
  v_has_frame_column BOOLEAN;
BEGIN
  -- Check if the table has a current_frame_id column
  v_has_frame_column := EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = TG_TABLE_NAME 
    AND column_name = 'current_frame_id'
  );

  -- Get or create a frame_id for this transition
  IF v_has_frame_column THEN
    EXECUTE format('SELECT ($1).current_frame_id') INTO v_frame_id USING NEW;
  END IF;
  
  IF v_frame_id IS NULL THEN
    SELECT id INTO v_frame_id FROM public.execution_frames 
     WHERE target_entity = TG_TABLE_NAME || ':' || NEW.id::text 
     AND executed = FALSE 
     ORDER BY initiated_at DESC LIMIT 1;
  END IF;
  
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
        WHEN OLD IS NULL THEN 'insert'
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
$function$;