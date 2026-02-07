-- Zero-Knowledge Ghost Upload Architecture
-- Phase 1: Create purge audit infrastructure

-- 1. Create purge_audit_log table to track all source video deletions
CREATE TABLE public.purge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  module_id UUID REFERENCES course_modules(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  purged_at TIMESTAMPTZ DEFAULT now(),
  purge_method TEXT CHECK (purge_method IN ('automatic', 'cron', 'manual')) NOT NULL DEFAULT 'automatic',
  file_hash TEXT, -- SHA256 hash for identification (not content) - optional
  verified BOOLEAN DEFAULT false,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purge_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access purge logs
CREATE POLICY "purge_audit_log_service_role_only" 
ON public.purge_audit_log 
FOR ALL 
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "purge_audit_log_service_role_access"
ON public.purge_audit_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Add source_purged_at columns to courses and course_modules
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS source_purged_at TIMESTAMPTZ;

ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS source_purged_at TIMESTAMPTZ;

-- 3. Add user_attestation fields for legal compliance
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS content_attestation_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS content_attestation_ip TEXT;

-- 4. Create index for efficient purge auditing
CREATE INDEX IF NOT EXISTS idx_purge_audit_log_course_id ON public.purge_audit_log(course_id);
CREATE INDEX IF NOT EXISTS idx_purge_audit_log_purged_at ON public.purge_audit_log(purged_at);
CREATE INDEX IF NOT EXISTS idx_courses_source_purged_at ON public.courses(source_purged_at) WHERE source_purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_course_modules_source_purged_at ON public.course_modules(source_purged_at) WHERE source_purged_at IS NULL;