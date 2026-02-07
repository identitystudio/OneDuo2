-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their support conversations" ON public.support_conversations;

-- Create a rate-limited SELECT policy that:
-- 1. Requires email to match exactly (no guessing)
-- 2. Adds rate limiting to prevent enumeration attempts
CREATE POLICY "Users can view their support conversations with rate limit" 
ON public.support_conversations 
FOR SELECT 
USING (
  (
    user_email = auth.email() 
    AND check_rate_limit(
      COALESCE(auth.uid()::text, 'anonymous'),
      'support_conversation_read',
      20,  -- max 20 requests
      5    -- per 5 minute window
    )
  )
  OR auth.role() = 'service_role'
);