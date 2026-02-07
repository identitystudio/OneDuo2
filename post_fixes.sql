-- POST-FIX: Create missing projects table (for folders)
CREATE TABLE IF NOT EXISTS public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS on projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Project Policies
DROP POLICY IF EXISTS "Users can manage their own projects" ON public.projects;
CREATE POLICY "Users can manage their own projects" 
ON public.projects FOR ALL 
USING (auth.uid() = user_id);

-- POST-FIX: Ensure courses table has missing columns
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'project_id') THEN
        ALTER TABLE public.courses ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'user_id') THEN
        ALTER TABLE public.courses ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'is_multi_module') THEN
        ALTER TABLE public.courses ADD COLUMN is_multi_module boolean DEFAULT false;
    END IF;
END $$;

-- Fix storage bucket settings for very large files
UPDATE storage.buckets SET file_size_limit = 53687091200 WHERE id = 'course-videos';
UPDATE storage.buckets SET file_size_limit = 53687091200 WHERE id = 'video-uploads';
