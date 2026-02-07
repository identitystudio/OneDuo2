-- Add user_id column to support_conversations for secure ownership
ALTER TABLE public.support_conversations 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create a secure ownership function for support conversations
CREATE OR REPLACE FUNCTION public.user_owns_support_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_conversations
    WHERE id = p_conversation_id
      AND (
        -- Primary check: user_id must match (strongest)
        user_id = auth.uid()
        -- Legacy fallback: only if user_id is NULL (old data)
        OR (user_id IS NULL AND user_email = auth.email())
      )
  )
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can create support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can update their own support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Rate limited support conversation access" ON public.support_conversations;

-- Create stricter RLS policies using secure function
CREATE POLICY "Users can view own support conversations securely"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (
  user_owns_support_conversation(id)
  AND check_rate_limit(
    COALESCE(auth.uid()::text, 'anonymous'),
    'support_view',
    20,
    5
  )
);

CREATE POLICY "Users can create support conversations with own identity"
ON public.support_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid() OR user_id IS NULL)
  AND user_email = auth.email()
);

CREATE POLICY "Users can update own support conversations securely"
ON public.support_conversations
FOR UPDATE
TO authenticated
USING (user_owns_support_conversation(id))
WITH CHECK (
  user_owns_support_conversation(id)
  AND user_email = (SELECT sc.user_email FROM support_conversations sc WHERE sc.id = support_conversations.id)
);

-- Service role full access
CREATE POLICY "Service role full access to support_conversations"
ON public.support_conversations
FOR ALL
TO authenticated
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');