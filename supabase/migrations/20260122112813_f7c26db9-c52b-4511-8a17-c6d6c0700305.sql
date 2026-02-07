-- Allow 'processing' status for courses (code currently writes this value)
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_status_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'queued'::text,
        'processing'::text,
        'transcribing'::text,
        'extracting_frames'::text,
        'rendering_gifs'::text,
        'training_ai'::text,
        'completed'::text,
        'failed'::text
      ]
    )
  );