-- ============================================
-- PATENT-CRITICAL ENFORCEMENT TRIGGERS
-- Structural Sovereignty Gate™ + Append-Only Ledger
-- ============================================

-- TRIGGER 1: Enforce Finalization Gate
-- Prevents status transition to 'finalized' unless all reasoning entries are approved
CREATE OR REPLACE FUNCTION public.enforce_finalization_gate()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when transitioning to 'finalized' status
  IF NEW.status = 'finalized' AND (OLD.status IS NULL OR OLD.status != 'finalized') THEN
    IF NOT public.can_finalize_artifact(NEW.id) THEN
      RAISE EXCEPTION 'SOVEREIGNTY GATE BLOCKED: Cannot finalize artifact - pending reasoning entries require human decision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_finalization_gate_trigger
BEFORE UPDATE ON public.transformation_artifacts
FOR EACH ROW EXECUTE FUNCTION public.enforce_finalization_gate();

-- TRIGGER 2: Enforce Reasoning Log Immutability (Append-Only Ledger)
-- Prevents UPDATE/DELETE on reasoning_logs except for superseded_by linking
CREATE OR REPLACE FUNCTION public.enforce_reasoning_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'APPEND-ONLY LEDGER: Reasoning logs cannot be deleted - create superseding entry instead';
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    -- Only allow updating superseded_by (to link to new entry) and human_decision (for Judge verdicts)
    IF OLD.source_type IS DISTINCT FROM NEW.source_type OR
       OLD.source_label IS DISTINCT FROM NEW.source_label OR
       OLD.source_role IS DISTINCT FROM NEW.source_role OR
       OLD.analysis_focus IS DISTINCT FROM NEW.analysis_focus OR
       OLD.summary IS DISTINCT FROM NEW.summary OR
       OLD.concern_level IS DISTINCT FROM NEW.concern_level OR
       OLD.recommendation IS DISTINCT FROM NEW.recommendation THEN
      RAISE EXCEPTION 'APPEND-ONLY LEDGER: Reasoning log content is immutable - create new entry to supersede';
    END IF;
    -- Allow: human_decision, decision_notes, superseded_by (governance flow)
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_reasoning_log_immutability_trigger
BEFORE UPDATE OR DELETE ON public.reasoning_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_reasoning_log_immutability();