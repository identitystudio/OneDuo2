-- OneDuo 2 Cognition Upgrades
-- Implements Quality Reporting and Advanced Intelligence Layers

ALTER TABLE public.transformation_artifacts 
ADD COLUMN IF NOT EXISTS quality_report JSONB,
ADD COLUMN IF NOT EXISTS action_sops JSONB,
ADD COLUMN IF NOT EXISTS self_diagnostic_score INTEGER DEFAULT 0;

-- Ensure artifact_frames has OCR confidence tracking
ALTER TABLE public.artifact_frames
ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC DEFAULT 1.0;
