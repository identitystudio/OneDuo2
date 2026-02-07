-- First, drop the constraint that's causing cascading updates
ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

-- Re-add without any cascade behavior (we keep orphan records in audit log which is fine for immutability)
ALTER TABLE purge_audit_log 
ADD CONSTRAINT purge_audit_log_course_id_fkey 
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- Also need to handle module_id constraint
ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_module_id_fkey;

ALTER TABLE purge_audit_log 
ADD CONSTRAINT purge_audit_log_module_id_fkey 
FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;