-- ============================================
-- IMMUTABLE AUDIT TRAIL - Timestamp Trigger
-- ============================================
-- Ensures created_at is always system-generated
-- Combined with existing RLS (INSERT/SELECT only) = immutable audit trail
-- ============================================

-- Create timestamp function
CREATE OR REPLACE FUNCTION public.set_verification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS verification_timestamp_trigger ON verification_approvals;

-- Create trigger for automatic timestamp on every insert
CREATE TRIGGER verification_timestamp_trigger
  BEFORE INSERT ON verification_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_verification_timestamp();