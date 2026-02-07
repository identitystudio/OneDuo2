-- Copy course_files from the queued course (with 252 files) to the completed course
UPDATE courses 
SET 
  course_files = (
    SELECT course_files FROM courses 
    WHERE id = 'eb99f515-5bd9-4f14-b47f-defd8f97eca5'
  ),
  pdf_revision_pending = true
WHERE id = '1f3e0121-2999-4ed6-b232-fac4cd0ded15';

-- Soft delete the duplicate/orphaned Michael Reimer courses (keep only the completed one)
UPDATE courses 
SET 
  purged = true,
  purged_at = now(),
  purged_by = 'system_cleanup'
WHERE title = 'Michael Reimer' 
  AND id != '1f3e0121-2999-4ed6-b232-fac4cd0ded15'
  AND email = 'christinaxcabral@gmail.com';