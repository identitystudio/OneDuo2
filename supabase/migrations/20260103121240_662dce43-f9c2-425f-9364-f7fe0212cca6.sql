-- ============================================
-- PATENT ALIGNMENT MIGRATION: 4 Core Fixes
-- ============================================

-- 1. JSON Canonicalization + Signature Verification for Approvals
ALTER TABLE public.verification_approvals 
ADD COLUMN IF NOT EXISTS payload_canonical TEXT,
ADD COLUMN IF NOT EXISTS payload_signature TEXT,
ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.verification_approvals.payload_canonical IS 
'Canonicalized JSON payload for tamper detection - All external inputs treated as untrusted';

COMMENT ON COLUMN public.verification_approvals.payload_signature IS 
'HMAC-SHA256 signature of canonical payload for integrity verification';

COMMENT ON COLUMN public.verification_approvals.signature_verified IS 
'TRUE only when signature verification passed - unsigned approvals cannot affect governance';

-- 2. Intent Confidence in Reasoning Ledger (anchor reasoning to observed emphasis)
ALTER TABLE public.reasoning_logs 
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS intent_frame_id UUID REFERENCES public.artifact_frames(id);

COMMENT ON COLUMN public.reasoning_logs.confidence_score IS 
'Intent confidence derived from Passive Emphasis Reconstructor – anchors reasoning to observed human emphasis';

COMMENT ON COLUMN public.reasoning_logs.intent_frame_id IS 
'Reference to artifact_frames for forensic chain-of-custody linking reasoning to visual evidence';

-- 3. Update Governance Language to match patent exactly
CREATE OR REPLACE FUNCTION public.enforce_finalization_gate()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when transitioning to 'finalized' status
  IF NEW.status = 'finalized' AND (OLD.status IS NULL OR OLD.status != 'finalized') THEN
    IF NOT public.can_finalize_artifact(NEW.id) THEN
      RAISE EXCEPTION 'EXECUTION IMPOSSIBLE UNTIL GOVERNANCE = TRUE: Cannot finalize artifact – pending reasoning entries require human decision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. BONUS: Make Purge Audit Log Truly Immutable (destruction certificates cannot be modified)
CREATE OR REPLACE FUNCTION public.enforce_purge_audit_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DESTRUCTION CERTIFICATES IMMUTABLE: Purge audit log entries cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'DESTRUCTION CERTIFICATES IMMUTABLE: Purge audit log entries cannot be modified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for purge audit immutability (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_purge_audit_immutability_trigger'
  ) THEN
    CREATE TRIGGER enforce_purge_audit_immutability_trigger
    BEFORE UPDATE OR DELETE ON public.purge_audit_log
    FOR EACH ROW EXECUTE FUNCTION public.enforce_purge_audit_immutability();
  END IF;
END $$;