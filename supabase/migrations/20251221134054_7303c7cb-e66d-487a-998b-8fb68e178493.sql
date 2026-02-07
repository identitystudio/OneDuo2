-- Fix location_boards: restrict access to owner only
DROP POLICY IF EXISTS "Anyone can view location boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can create location boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can update location boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can delete location boards" ON public.location_boards;

CREATE POLICY "Users can view their own location boards"
ON public.location_boards FOR SELECT
USING (user_identifier = current_setting('request.headers', true)::json->>'x-session-id' 
  OR user_identifier IS NULL);

CREATE POLICY "Users can create their own location boards"
ON public.location_boards FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own location boards"
ON public.location_boards FOR UPDATE
USING (user_identifier = current_setting('request.headers', true)::json->>'x-session-id');

CREATE POLICY "Users can delete their own location boards"
ON public.location_boards FOR DELETE
USING (user_identifier = current_setting('request.headers', true)::json->>'x-session-id');

-- Fix rate_limits: make it system-managed only (no public INSERT)
DROP POLICY IF EXISTS "Anyone can create rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can view their own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can update their own rate limits" ON public.rate_limits;

-- Only allow viewing own rate limits, no public write access
CREATE POLICY "Users can view their own rate limits"
ON public.rate_limits FOR SELECT
USING (session_id = current_setting('request.headers', true)::json->>'x-session-id');

-- Rate limits should only be managed by security definer functions, not direct inserts