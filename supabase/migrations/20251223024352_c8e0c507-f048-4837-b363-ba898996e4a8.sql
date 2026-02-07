-- Fix email_subscribers RLS - restrict to service role only (for edge functions)
-- First, enable RLS if not already enabled
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Allow public insert for email capture" ON public.email_subscribers;
DROP POLICY IF EXISTS "email_subscribers_insert_policy" ON public.email_subscribers;
DROP POLICY IF EXISTS "email_subscribers_select_policy" ON public.email_subscribers;

-- Create restrictive policy - only service role can access (edge functions use service role)
-- No policies = only service role access when RLS is enabled
-- This means frontend can't query directly, only through edge functions

-- For the public_courses view - it's intentionally public for course catalog display
-- Mark as acknowledged by not adding restrictive RLS (it's a view of already-protected data)