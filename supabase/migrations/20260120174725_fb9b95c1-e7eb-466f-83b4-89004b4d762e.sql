-- Drop unused tables from deprecated features
-- These tables have 0 rows and no code references

-- Processing jobs (replaced by processing_queue)
DROP TABLE IF EXISTS public.processing_jobs CASCADE;

-- Batch jobs (not used)
DROP TABLE IF EXISTS public.batch_jobs CASCADE;

-- Story/Episode tables (film feature never launched)
DROP TABLE IF EXISTS public.episode_footage CASCADE;
DROP TABLE IF EXISTS public.episodes CASCADE;
DROP TABLE IF EXISTS public.story_state CASCADE;
DROP TABLE IF EXISTS public.story_series CASCADE;

-- Location photos (not used)
DROP TABLE IF EXISTS public.location_photos CASCADE;
DROP TABLE IF EXISTS public.location_boards CASCADE;

-- Add comment to complete_step_and_queue_next marking it as deprecated
COMMENT ON FUNCTION public.complete_step_and_queue_next(uuid, uuid, text, jsonb) IS 
  'DEPRECATED: Use complete_processing_job instead. This function does not clear claimed_by or visibility_timeout.';