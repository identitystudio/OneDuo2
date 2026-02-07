-- ============ FIX SECURITY ISSUES ============

-- ISSUE 1: email_subscribers has conflicting RLS policies
-- Drop the redundant/conflicting policy
DROP POLICY IF EXISTS "Service role only access" ON public.email_subscribers;

-- ISSUE 2: courses has "Block anonymous SELECT" policy that allows 
-- viewing completed courses (including emails) - this is dangerous
DROP POLICY IF EXISTS "Block anonymous SELECT" ON public.courses;

-- The "Block anonymous SELECT on courses" policy with USING: false is 
-- redundant when we have proper ownership-based policies, but it's not harmful.
-- We'll keep it as an extra layer of protection.