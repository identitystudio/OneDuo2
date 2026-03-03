-- GOVERNANCE: Add approval_signature column to verification_approvals
-- Run this in your Supabase SQL editor

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'verification_approvals'
    AND COLUMN_NAME = 'approval_signature'
  ) THEN
    ALTER TABLE public.verification_approvals
    ADD COLUMN approval_signature text;
  END IF;
END $$;
