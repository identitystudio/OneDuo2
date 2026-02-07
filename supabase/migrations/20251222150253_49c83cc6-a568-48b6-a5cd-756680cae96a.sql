-- Fix critical security issues

-- 1. Drop the overly permissive "Anyone can create courses" policy
DROP POLICY IF EXISTS "Anyone can create courses" ON public.courses;

-- 2. Create a more restrictive policy for course creation
-- Users must either be authenticated OR go through rate limiting
CREATE POLICY "Rate limited course creation" 
ON public.courses 
FOR INSERT 
WITH CHECK (
  -- Allow if user is authenticated
  auth.uid() IS NOT NULL 
  OR 
  -- OR if rate limit hasn't been exceeded (checked via function)
  public.check_rate_limit(
    COALESCE(
      (current_setting('request.headers'::text, true)::json->>'x-session-id'),
      'anonymous'
    ),
    'course_creation',
    5,  -- max 5 courses
    60  -- per 60 minutes
  )
);

-- 3. Drop overly permissive mock_orders INSERT policy
DROP POLICY IF EXISTS "Anyone can create mock orders" ON public.mock_orders;

-- 4. Create rate-limited mock_orders INSERT policy
CREATE POLICY "Rate limited mock order creation" 
ON public.mock_orders 
FOR INSERT 
WITH CHECK (
  public.check_rate_limit(
    COALESCE(
      (current_setting('request.headers'::text, true)::json->>'x-session-id'),
      'anonymous'
    ),
    'mock_order',
    3,  -- max 3 orders
    60  -- per 60 minutes
  )
);

-- 5. Drop overly permissive page_visits INSERT policy  
DROP POLICY IF EXISTS "Anyone can log page visits" ON public.page_visits;

-- 6. Create rate-limited page_visits INSERT policy
CREATE POLICY "Rate limited page visit logging" 
ON public.page_visits 
FOR INSERT 
WITH CHECK (
  public.check_rate_limit(
    COALESCE(
      (current_setting('request.headers'::text, true)::json->>'x-session-id'),
      'anonymous'
    ),
    'page_visit',
    100,  -- max 100 visits
    60    -- per 60 minutes
  )
);

-- 7. Drop overly permissive location_boards INSERT policy
DROP POLICY IF EXISTS "Users can create their own location boards" ON public.location_boards;

-- 8. Create proper location_boards INSERT policy with session validation
CREATE POLICY "Users can create location boards with session" 
ON public.location_boards 
FOR INSERT 
WITH CHECK (
  user_identifier = (current_setting('request.headers'::text, true)::json->>'x-session-id')
  AND (current_setting('request.headers'::text, true)::json->>'x-session-id') IS NOT NULL
);