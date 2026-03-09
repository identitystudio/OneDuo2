-- GOVERNANCE: Add server_hmac column to verification_approvals
-- This enables tamper-detection: server computes HMAC at approval creation,
-- re-verifies at PDF generation time. If they don't match, the approval was
-- injected directly into the DB (sovereignty breach).
-- Run this in your Supabase SQL editor

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'verification_approvals'
    AND COLUMN_NAME = 'server_hmac'
  ) THEN
    ALTER TABLE public.verification_approvals
    ADD COLUMN server_hmac text;
  END IF;
END $$;
