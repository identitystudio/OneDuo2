-- FINAL PERMISSIONS & SCHEMA REPAIR
-- Run this in the Supabase SQL Editor to fix 403 and 500 errors

-- 1. Ensure permissions are granted to all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon, service_role;

-- 2. Create missing mission-critical tables
CREATE TABLE IF NOT EXISTS public.job_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID, -- Can be course_id or module_id or prediction_id
    step TEXT NOT NULL,
    level TEXT DEFAULT 'info',
    message TEXT,
    error_reason TEXT,
    error_stack TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Add missing columns to courses (to fix 500 errors in process-course)
DO $$ 
BEGIN 
    -- Basic info
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'project_id') THEN
        ALTER TABLE public.courses ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'progress_step') THEN
        ALTER TABLE public.courses ADD COLUMN progress_step TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'is_multi_module') THEN
        ALTER TABLE public.courses ADD COLUMN is_multi_module BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'module_count') THEN
        ALTER TABLE public.courses ADD COLUMN module_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'completed_modules') THEN
        ALTER TABLE public.courses ADD COLUMN completed_modules INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'fix_attempts') THEN
        ALTER TABLE public.courses ADD COLUMN fix_attempts INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'last_fix_strategy') THEN
        ALTER TABLE public.courses ADD COLUMN last_fix_strategy TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'share_enabled') THEN
        ALTER TABLE public.courses ADD COLUMN share_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'share_token') THEN
        ALTER TABLE public.courses ADD COLUMN share_token TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'last_heartbeat_at') THEN
        ALTER TABLE public.courses ADD COLUMN last_heartbeat_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'pdf_revision_pending') THEN
        ALTER TABLE public.courses ADD COLUMN pdf_revision_pending BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'course_files') THEN
        ALTER TABLE public.courses ADD COLUMN course_files JSONB DEFAULT '[]';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'purged') THEN
        ALTER TABLE public.courses ADD COLUMN purged BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 4. Add missing columns to course_modules
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'course_modules' AND COLUMN_NAME = 'status') THEN
        ALTER TABLE public.course_modules ADD COLUMN status TEXT DEFAULT 'queued';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'course_modules' AND COLUMN_NAME = 'progress') THEN
        ALTER TABLE public.course_modules ADD COLUMN progress INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'course_modules' AND COLUMN_NAME = 'progress_step') THEN
        ALTER TABLE public.course_modules ADD COLUMN progress_step TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'course_modules' AND COLUMN_NAME = 'error_message') THEN
        ALTER TABLE public.course_modules ADD COLUMN error_message TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'course_modules' AND COLUMN_NAME = 'heartbeat_at') THEN
        ALTER TABLE public.course_modules ADD COLUMN heartbeat_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'course_modules' AND COLUMN_NAME = 'purged') THEN
        ALTER TABLE public.course_modules ADD COLUMN purged BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 5. Fix RLS 403 Forbidden errors
DROP POLICY IF EXISTS "Public can view projects" ON public.projects;
CREATE POLICY "Public can view projects" ON public.projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view page visits" ON public.page_visits;
CREATE POLICY "Anyone can view page visits" ON public.page_visits FOR SELECT USING (true);

-- 6. Fix Database Unavailable in Health Check
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow health check to see courses" ON public.courses;
CREATE POLICY "Allow health check to see courses" ON public.courses FOR SELECT USING (true);

-- 7. Ensure Storage Buckets are Public
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-videos', 'course-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('video-uploads', 'video-uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;

-- 8. Intelligence Layer & Naming Mismatch Fixes
-- Ensure transformation_artifacts exists
CREATE TABLE IF NOT EXISTS public.transformation_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_title text NOT NULL,
  video_url text NOT NULL,
  storage_path text,
  duration_seconds integer NOT NULL DEFAULT 0,
  frame_count integer NOT NULL DEFAULT 0,
  key_moments integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add missing columns to transformation_artifacts
ALTER TABLE public.transformation_artifacts ADD COLUMN IF NOT EXISTS key_moments_index jsonb DEFAULT '[]';
ALTER TABLE public.transformation_artifacts ADD COLUMN IF NOT EXISTS concepts_frameworks jsonb DEFAULT '[]';
ALTER TABLE public.transformation_artifacts ADD COLUMN IF NOT EXISTS hidden_patterns jsonb DEFAULT '[]';
ALTER TABLE public.transformation_artifacts ADD COLUMN IF NOT EXISTS implementation_steps jsonb DEFAULT '[]';

-- Rename any existing canonical_artifact_id to transformation_artifact_id if present to match code
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='canonical_artifact_id') THEN
    ALTER TABLE public.courses RENAME COLUMN canonical_artifact_id TO transformation_artifact_id;
  END IF;
EXCEPTION WHEN OTHERS THEN 
  -- Do nothing if already exists or other error
END $$;

-- Add missing columns and relationships to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS transformation_artifact_id UUID REFERENCES public.transformation_artifacts(id) ON DELETE SET NULL;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS progress_step TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_multi_module BOOLEAN DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Ensure course_modules has the relationship column
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS transformation_artifact_id UUID REFERENCES public.transformation_artifacts(id) ON DELETE SET NULL;

-- Enable RLS and permissions for transformation_artifacts
ALTER TABLE public.transformation_artifacts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.transformation_artifacts TO service_role;
GRANT SELECT ON public.transformation_artifacts TO authenticated;

-- Policy for users to see their own artifacts
DROP POLICY IF EXISTS "Users can view own artifacts" ON public.transformation_artifacts;
CREATE POLICY "Users can view own artifacts"
  ON public.transformation_artifacts FOR SELECT
  USING (auth.uid() = user_id);
