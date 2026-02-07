-- Add audio_events JSONB column to courses table for storing screenplay-style audio analysis
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS audio_events JSONB DEFAULT NULL;

-- Add audio_events JSONB column to course_modules table for multi-module courses
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS audio_events JSONB DEFAULT NULL;

-- Add prosody_annotations JSONB column to store analyze-audio-prosody results
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS prosody_annotations JSONB DEFAULT NULL;

ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS prosody_annotations JSONB DEFAULT NULL;

-- Add index for courses with audio events (for querying)
CREATE INDEX IF NOT EXISTS idx_courses_audio_events ON public.courses USING GIN (audio_events) WHERE audio_events IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modules_audio_events ON public.course_modules USING GIN (audio_events) WHERE audio_events IS NOT NULL;

-- Comment explaining the structure
COMMENT ON COLUMN public.courses.audio_events IS 'Screenplay-style audio events: {music_cues: [], ambient_sounds: [], reactions: [], meaningful_pauses: []}';
COMMENT ON COLUMN public.courses.prosody_annotations IS 'Audio prosody analysis: {annotations: [], overall_tone: string, key_moments: []}';