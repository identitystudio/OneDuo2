-- FIX: Drop conflicting storage policies before creating them
DROP POLICY IF EXISTS "Allow public read access to course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to course-gifs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to course-gifs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to course-gifs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from course-gifs" ON storage.objects;

-- FIX: Create missing projects table (for folders)
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
CREATE POLICY "Users can manage their own projects" 
ON public.projects FOR ALL 
USING (auth.uid() = user_id);

-- FIX: Ensure courses table has project_id column
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'project_id') THEN
        ALTER TABLE public.courses ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'user_id') THEN
        ALTER TABLE public.courses ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'courses' AND COLUMN_NAME = 'density_mode') THEN
        ALTER TABLE public.courses ADD COLUMN density_mode text DEFAULT 'standard';
    END IF;
END $$;
