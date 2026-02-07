-- Fix the step check constraint to include ALL valid steps including parallel processing steps
ALTER TABLE processing_queue DROP CONSTRAINT IF EXISTS processing_queue_step_check;

ALTER TABLE processing_queue ADD CONSTRAINT processing_queue_step_check 
CHECK (step = ANY (ARRAY[
  'transcribe'::text, 
  'transcribe_and_extract'::text,
  'extract_frames'::text, 
  'render_gifs'::text, 
  'train_ai'::text,
  'analyze_audio'::text,
  'build_pdf'::text,
  'transcribe_module'::text,
  'transcribe_and_extract_module'::text,
  'extract_frames_module'::text,
  'render_gifs_module'::text,
  'train_ai_module'::text,
  'analyze_audio_module'::text,
  'build_pdf_module'::text,
  'check_next_module'::text
]));