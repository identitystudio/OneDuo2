
-- Add 'transcript_only' as a valid density_mode for large file fallbacks
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_density_mode_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_density_mode_check 
  CHECK (density_mode = ANY (ARRAY['standard'::text, 'cinematic'::text, 'transcript_only'::text]));
