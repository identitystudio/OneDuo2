-- Add pdf_revision_pending flag to track when artifacts have been updated
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS pdf_revision_pending boolean DEFAULT false;