-- Change the foreign key constraint on purge_audit_log to SET NULL instead of CASCADE
-- This allows deleting the course without affecting the immutable audit log

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

ALTER TABLE purge_audit_log 
ADD CONSTRAINT purge_audit_log_course_id_fkey 
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL;