-- PDF Generation Progress Tracking
-- Adds columns to track visual transcription PDF generation progress
-- so the dashboard can show real-time part-by-part progress.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS pdf_generation_status TEXT DEFAULT 'idle'
    CHECK (pdf_generation_status IN ('idle', 'generating', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS pdf_generation_progress JSONB DEFAULT NULL;

-- Index for dashboard polling
CREATE INDEX IF NOT EXISTS idx_courses_pdf_generation_status
  ON courses (pdf_generation_status)
  WHERE pdf_generation_status = 'generating';
