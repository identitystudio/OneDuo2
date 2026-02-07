-- Create triggers for hard delete prevention on governed tables
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