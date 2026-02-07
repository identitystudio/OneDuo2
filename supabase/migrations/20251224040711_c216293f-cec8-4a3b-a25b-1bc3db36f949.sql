-- Force RLS on all sensitive tables to prevent any bypass
ALTER TABLE public.email_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tag_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ops_auto_fixes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ops_patterns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mock_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.processing_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;

-- Add explicit deny policies for anonymous/authenticated on sensitive service-only tables
-- email_logs
DROP POLICY IF EXISTS "Block all non-service access to email_logs" ON public.email_logs;
CREATE POLICY "Block all non-service access to email_logs"
ON public.email_logs FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- tag_history  
DROP POLICY IF EXISTS "Block all non-service access to tag_history" ON public.tag_history;
CREATE POLICY "Block all non-service access to tag_history"
ON public.tag_history FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- error_logs
DROP POLICY IF EXISTS "Block all non-service access to error_logs" ON public.error_logs;
CREATE POLICY "Block all non-service access to error_logs"
ON public.error_logs FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- ops_auto_fixes
DROP POLICY IF EXISTS "Block all non-service access to ops_auto_fixes" ON public.ops_auto_fixes;
CREATE POLICY "Block all non-service access to ops_auto_fixes"
ON public.ops_auto_fixes FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- ops_patterns
DROP POLICY IF EXISTS "Block all non-service access to ops_patterns" ON public.ops_patterns;
CREATE POLICY "Block all non-service access to ops_patterns"
ON public.ops_patterns FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- marketing_settings
DROP POLICY IF EXISTS "Block all non-service access to marketing_settings" ON public.marketing_settings;
CREATE POLICY "Block all non-service access to marketing_settings"
ON public.marketing_settings FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- processing_queue
DROP POLICY IF EXISTS "Block all non-service access to processing_queue" ON public.processing_queue;
CREATE POLICY "Block all non-service access to processing_queue"
ON public.processing_queue FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);