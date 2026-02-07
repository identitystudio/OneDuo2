-- Drop the foreign key constraints entirely from purge_audit_log
-- The audit log should be completely independent and immutable
-- Orphaned course_id values are fine - they just reference deleted courses

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_module_id_fkey;