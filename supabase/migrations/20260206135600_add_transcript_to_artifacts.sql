-- Add transcript column to transformation_artifacts
ALTER TABLE public.transformation_artifacts ADD COLUMN IF NOT EXISTS transcript jsonb DEFAULT '[]';
