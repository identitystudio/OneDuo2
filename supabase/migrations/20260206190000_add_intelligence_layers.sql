-- Add Intelligence Layer columns to transformation_artifacts
ALTER TABLE public.transformation_artifacts 
ADD COLUMN IF NOT EXISTS key_moments_index jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS concepts_frameworks jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS hidden_patterns jsonb DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN public.transformation_artifacts.key_moments_index IS 'A list of important moments with timestamps and short descriptions.';
COMMENT ON COLUMN public.transformation_artifacts.concepts_frameworks IS 'Extracted models, systems, strategies, and repeatable ideas.';
COMMENT ON COLUMN public.transformation_artifacts.hidden_patterns IS 'Analysis of emotional beats, persuasion techniques, and content structure.';
