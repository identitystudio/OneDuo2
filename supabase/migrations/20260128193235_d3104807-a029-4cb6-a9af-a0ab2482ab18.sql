-- Add 'awaiting_webhook' to the processing_queue status constraint
-- This status is used when jobs are waiting for external webhook callbacks (Replicate, AssemblyAI)

ALTER TABLE processing_queue DROP CONSTRAINT processing_queue_status_check;

ALTER TABLE processing_queue ADD CONSTRAINT processing_queue_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'awaiting_webhook'::text, 'completed'::text, 'failed'::text]));