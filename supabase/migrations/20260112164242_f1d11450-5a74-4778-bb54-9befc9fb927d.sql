-- =====================================================
-- PURGE GOVERNANCE LAYER
-- Constitutional soft-delete enforcement
-- =====================================================

-- 1. Add purge columns to governed tables
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS purged_by TEXT,
ADD COLUMN IF NOT EXISTS purge_frame_id UUID REFERENCES execution_frames(id);

ALTER TABLE course_modules 
ADD COLUMN IF NOT EXISTS purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS purged_by TEXT,
ADD COLUMN IF NOT EXISTS purge_frame_id UUID REFERENCES execution_frames(id);

ALTER TABLE processing_queue 
ADD COLUMN IF NOT EXISTS purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS purged_by TEXT,
ADD COLUMN IF NOT EXISTS purge_frame_id UUID REFERENCES execution_frames(id);

-- 2. Add 'purge' gate to approval_gates
INSERT INTO approval_gates (gate_name, operation_pattern, entity_types, requires_approval, auto_approve_conditions) 
VALUES ('purge_entity', 'purge|delete', ARRAY['course', 'course_modules', 'processing_queue'], FALSE, '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- 3. Create purge enforcement trigger function
CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Block all hard deletes on governed tables
  RAISE EXCEPTION 'GOVERNANCE VIOLATION: Hard deletes forbidden. Use soft delete (purged=TRUE) via execution frame.';
  RETURN NULL;
END;
$$;

-- Create triggers for each governed table
DROP TRIGGER IF EXISTS prevent_course_hard_delete ON courses;
CREATE TRIGGER prevent_course_hard_delete
  BEFORE DELETE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_module_hard_delete ON course_modules;
CREATE TRIGGER prevent_module_hard_delete
  BEFORE DELETE ON course_modules
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_queue_hard_delete ON processing_queue;
CREATE TRIGGER prevent_queue_hard_delete
  BEFORE DELETE ON processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

-- 4. Re-add FK constraints to purge_audit_log with NO ACTION (immutable audit log)
-- These may have been dropped earlier, so add them back properly
ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_module_id_fkey;

-- Note: We intentionally do NOT re-add FK constraints to purge_audit_log
-- because audit logs must remain immutable even when source records are soft-deleted
-- The course_id and module_id columns remain as TEXT references that can become orphaned

-- 5. Create index for efficient purged queries
CREATE INDEX IF NOT EXISTS idx_courses_purged ON courses(purged) WHERE purged = FALSE;
CREATE INDEX IF NOT EXISTS idx_course_modules_purged ON course_modules(purged) WHERE purged = FALSE;
CREATE INDEX IF NOT EXISTS idx_processing_queue_purged ON processing_queue(purged) WHERE purged = FALSE;

-- 6. Add comment for governance documentation
COMMENT ON COLUMN courses.purged IS 'Soft delete flag - records are never hard deleted';
COMMENT ON COLUMN courses.purge_frame_id IS 'Reference to the execution frame that authorized the purge';
COMMENT ON COLUMN course_modules.purged IS 'Soft delete flag - records are never hard deleted';
COMMENT ON COLUMN course_modules.purge_frame_id IS 'Reference to the execution frame that authorized the purge';
COMMENT ON COLUMN processing_queue.purged IS 'Soft delete flag - records are never hard deleted';
COMMENT ON COLUMN processing_queue.purge_frame_id IS 'Reference to the execution frame that authorized the purge';