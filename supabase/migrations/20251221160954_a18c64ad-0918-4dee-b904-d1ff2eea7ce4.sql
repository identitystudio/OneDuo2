-- Fix 1: Remove overly permissive location_boards policies
DROP POLICY IF EXISTS "Anyone can create boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can delete boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can update boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can view boards" ON public.location_boards;

-- Fix 2: Add proper SELECT restriction to email_subscribers (only service role)
-- The existing "Anyone can subscribe" INSERT policy is fine for public signups
-- The "Service role full access" is already there for admin operations
-- No changes needed - service role policies work correctly

-- Fix 3: Restrict courses INSERT to require email header
DROP POLICY IF EXISTS "Users can create courses" ON public.courses;
CREATE POLICY "Users can create courses with email" 
ON public.courses 
FOR INSERT 
WITH CHECK (email = ((current_setting('request.headers'::text, true))::json ->> 'x-user-email'::text));

-- Fix 4: Restrict courses UPDATE to email match
DROP POLICY IF EXISTS "System can update courses" ON public.courses;
CREATE POLICY "Users can update their courses" 
ON public.courses 
FOR UPDATE 
USING (email = ((current_setting('request.headers'::text, true))::json ->> 'x-user-email'::text));

-- Fix 5: Restrict processing_queue to service role only by removing the permissive policy
-- and adding a proper service role policy
DROP POLICY IF EXISTS "System can manage processing queue" ON public.processing_queue;

-- Since RLS is enabled and there are no policies, only service role can access
-- Add an explicit service role policy for clarity
CREATE POLICY "Service role can manage processing queue" 
ON public.processing_queue 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix 6: Restrict rate_limits INSERT to service role only
DROP POLICY IF EXISTS "Anyone can create rate limit records" ON public.rate_limits;
CREATE POLICY "Service role can create rate limit records" 
ON public.rate_limits 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Also fix rate_limits SELECT and UPDATE to work for session-based reads or service role
DROP POLICY IF EXISTS "Users can view their rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can view their own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can update their rate limits" ON public.rate_limits;

CREATE POLICY "Users can view rate limits" 
ON public.rate_limits 
FOR SELECT 
USING (
  session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
  OR auth.role() = 'service_role'
);

CREATE POLICY "Service role can update rate limits" 
ON public.rate_limits 
FOR UPDATE 
USING (auth.role() = 'service_role');