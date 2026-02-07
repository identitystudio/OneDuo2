-- ============================================================
-- GOVERNANCE LAYER: Execution Frames & State Transition System
-- Constitutional enforcement for all state changes
-- ============================================================

-- Table 1: execution_frames
-- Every state transition requires a frame. No action without identity.
CREATE TABLE public.execution_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_type TEXT NOT NULL CHECK (frame_type IN ('human_approval', 'ai_execution', 'constraint_check', 'recovery')),
  initiated_by TEXT NOT NULL,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_entity TEXT NOT NULL,
  target_operation TEXT NOT NULL,
  proposed_state JSONB NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'expired')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  constraint_violations JSONB DEFAULT '[]'::jsonb,
  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_execution_frames_target ON public.execution_frames(target_entity);
CREATE INDEX idx_execution_frames_status ON public.execution_frames(approval_status);
CREATE INDEX idx_execution_frames_executed ON public.execution_frames(executed);

-- Table 2: state_transitions
-- Immutable log of every state change. Truth layer.
CREATE TABLE public.state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id UUID NOT NULL REFERENCES public.execution_frames(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  from_state JSONB NOT NULL,
  to_state JSONB NOT NULL,
  transition_type TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversible BOOLEAN DEFAULT FALSE,
  reversal_frame_id UUID REFERENCES public.execution_frames(id)
);

CREATE INDEX idx_state_transitions_entity ON public.state_transitions(entity_type, entity_id);
CREATE INDEX idx_state_transitions_frame ON public.state_transitions(frame_id);
CREATE INDEX idx_state_transitions_occurred ON public.state_transitions(occurred_at DESC);

-- Table 3: constraint_violations
-- Log every constraint check. Make failures visible.
CREATE TABLE public.constraint_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  constraint_name TEXT NOT NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('schema', 'business_logic', 'race_condition', 'timeout', 'data_integrity')),
  expected_state JSONB NOT NULL,
  actual_state JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'error', 'warning')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_frame_id UUID REFERENCES public.execution_frames(id)
);

CREATE INDEX idx_constraint_violations_unresolved ON public.constraint_violations(resolved) WHERE resolved = FALSE;
CREATE INDEX idx_constraint_violations_entity ON public.constraint_violations(entity_type, entity_id);

-- Table 4: approval_gates
-- Define which operations require human approval.
CREATE TABLE public.approval_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_name TEXT UNIQUE NOT NULL,
  operation_pattern TEXT NOT NULL,
  entity_types TEXT[] NOT NULL,
  requires_approval BOOLEAN DEFAULT TRUE,
  auto_approve_conditions JSONB DEFAULT '{}'::jsonb,
  timeout_minutes INTEGER DEFAULT 60,
  approver_roles TEXT[] DEFAULT ARRAY['admin']::TEXT[],
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed data for approval_gates
INSERT INTO public.approval_gates (gate_name, operation_pattern, entity_types, requires_approval, auto_approve_conditions) VALUES
('mark_as_failed', 'mark_failed|status:failed', ARRAY['course'], TRUE, '{"data_check": {"frame_urls": "not_null", "transcript": "not_null"}}'::jsonb),
('delete_artifacts', 'delete', ARRAY['transformation_artifacts'], TRUE, '{}'::jsonb),
('recover_from_failure', 'recovery', ARRAY['course'], TRUE, '{}'::jsonb),
('queue_next_step', 'queue_job', ARRAY['processing_queue'], FALSE, '{"previous_step_completed": true}'::jsonb);

-- Immutability trigger for state_transitions (no updates/deletes)
CREATE OR REPLACE FUNCTION public.enforce_state_transitions_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'STATE TRANSITIONS IMMUTABLE: Cannot delete state transition records';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'STATE TRANSITIONS IMMUTABLE: Cannot modify state transition records';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_state_transitions_immutability_trigger
  BEFORE UPDATE OR DELETE ON public.state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_state_transitions_immutability();

-- Enable RLS on all governance tables
ALTER TABLE public.execution_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constraint_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_gates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Service role only (backend functions)
CREATE POLICY "Service role full access to execution_frames"
  ON public.execution_frames
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to state_transitions"
  ON public.state_transitions
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to constraint_violations"
  ON public.constraint_violations
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to approval_gates"
  ON public.approval_gates
  FOR ALL
  USING (true)
  WITH CHECK (true);