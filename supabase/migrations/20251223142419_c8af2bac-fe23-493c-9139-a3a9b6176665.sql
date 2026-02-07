-- ============ AUTO-OPS TABLES FOR SELF-HEALING ============

-- Table to track detected issues and auto-fixes
CREATE TABLE public.ops_auto_fixes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_type TEXT NOT NULL,  -- 'security', 'file_size', 'processing_error', 'user_confusion'
  issue_description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',  -- 'low', 'medium', 'high', 'critical'
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  auto_fixed BOOLEAN NOT NULL DEFAULT false,
  fix_applied TEXT,
  fixed_at TIMESTAMP WITH TIME ZONE,
  pattern_count INTEGER NOT NULL DEFAULT 1,  -- How many times this pattern occurred
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  user_email TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.ops_auto_fixes ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table
CREATE POLICY "Service role only for ops_auto_fixes"
ON public.ops_auto_fixes
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for pattern detection queries
CREATE INDEX idx_ops_auto_fixes_type_pattern ON public.ops_auto_fixes(issue_type, pattern_count);
CREATE INDEX idx_ops_auto_fixes_detected ON public.ops_auto_fixes(detected_at DESC);

-- Table for user support conversations (AI chatbot)
CREATE TABLE public.support_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'resolved', 'escalated'
  resolution_summary TEXT
);

-- Enable RLS
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

-- Users can view their own conversations, service role can access all
CREATE POLICY "Users can view their support conversations"
ON public.support_conversations
FOR SELECT
USING (user_email = auth.email() OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage all conversations"
ON public.support_conversations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Table for individual chat messages in support
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- 'user', 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  emailed_to_user BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own messages
CREATE POLICY "Users can view their support messages"
ON public.support_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_conversations sc
    WHERE sc.id = support_messages.conversation_id
    AND (sc.user_email = auth.email() OR auth.role() = 'service_role')
  )
);

CREATE POLICY "Service role can manage all messages"
ON public.support_messages
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for conversation lookups
CREATE INDEX idx_support_messages_conversation ON public.support_messages(conversation_id, created_at);

-- Table for pattern tracking (edge-case whack-a-mole detection)
CREATE TABLE public.ops_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_key TEXT NOT NULL UNIQUE,  -- e.g., 'file_size_too_large', 'vimeo_rate_limit'
  pattern_description TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  auto_fix_available BOOLEAN NOT NULL DEFAULT false,
  auto_fix_strategy TEXT,
  last_auto_fix_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.ops_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for ops_patterns"
ON public.ops_patterns
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Upsert function for pattern tracking
CREATE OR REPLACE FUNCTION public.track_pattern(
  p_pattern_key TEXT,
  p_description TEXT,
  p_auto_fix_available BOOLEAN DEFAULT false,
  p_auto_fix_strategy TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ops_patterns (pattern_key, pattern_description, auto_fix_available, auto_fix_strategy)
  VALUES (p_pattern_key, p_description, p_auto_fix_available, p_auto_fix_strategy)
  ON CONFLICT (pattern_key) DO UPDATE SET
    occurrence_count = ops_patterns.occurrence_count + 1,
    last_seen = now(),
    auto_fix_available = COALESCE(p_auto_fix_available, ops_patterns.auto_fix_available),
    auto_fix_strategy = COALESCE(p_auto_fix_strategy, ops_patterns.auto_fix_strategy);
END;
$$;