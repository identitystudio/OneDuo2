-- ============================================================
-- Knowledge Layer Migration
-- Adds structured AI knowledge layer columns to courses and
-- course_modules tables. Generated output is stored as JSONB
-- (structured sections) and TEXT (raw markdown for Poe/bots).
-- ============================================================

-- ---- courses table ----
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS knowledge_layer         JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS knowledge_layer_status  TEXT     DEFAULT 'pending'
    CHECK (knowledge_layer_status IN ('pending', 'generating', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS knowledge_layer_txt     TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS knowledge_layer_error   TEXT     DEFAULT NULL;

-- ---- course_modules table ----
ALTER TABLE course_modules
  ADD COLUMN IF NOT EXISTS knowledge_layer         JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS knowledge_layer_status  TEXT     DEFAULT 'pending'
    CHECK (knowledge_layer_status IN ('pending', 'generating', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS knowledge_layer_txt     TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS knowledge_layer_error   TEXT     DEFAULT NULL;

-- Index for quick status queries (dashboard polling)
CREATE INDEX IF NOT EXISTS idx_courses_kl_status
  ON courses (knowledge_layer_status)
  WHERE knowledge_layer_status IN ('generating', 'failed');

CREATE INDEX IF NOT EXISTS idx_modules_kl_status
  ON course_modules (knowledge_layer_status)
  WHERE knowledge_layer_status IN ('generating', 'failed');
