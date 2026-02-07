-- Fix email_logs: restrict SELECT to service_role only
DROP POLICY IF EXISTS "Service role full access to email_logs" ON public.email_logs;

CREATE POLICY "Service role full access to email_logs"
ON public.email_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix tag_history: restrict SELECT to service_role only  
DROP POLICY IF EXISTS "Service role full access to tag_history" ON public.tag_history;

CREATE POLICY "Service role full access to tag_history"
ON public.tag_history
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix marketing_settings: restrict to service_role only
DROP POLICY IF EXISTS "Service role full access to marketing_settings" ON public.marketing_settings;

CREATE POLICY "Service role full access to marketing_settings"
ON public.marketing_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix page_visits: restrict SELECT to service_role, keep INSERT open
DROP POLICY IF EXISTS "Service role full access to page_visits" ON public.page_visits;
DROP POLICY IF EXISTS "Anyone can log page visits" ON public.page_visits;

CREATE POLICY "Anyone can log page visits"
ON public.page_visits
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can read page_visits"
ON public.page_visits
FOR SELECT
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can update page_visits"
ON public.page_visits
FOR UPDATE
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete page_visits"
ON public.page_visits
FOR DELETE
USING (auth.role() = 'service_role');

-- Fix mock_orders: restrict SELECT to service_role
DROP POLICY IF EXISTS "Service role full access to mock_orders" ON public.mock_orders;
DROP POLICY IF EXISTS "Anyone can create mock orders" ON public.mock_orders;

CREATE POLICY "Anyone can create mock orders"
ON public.mock_orders
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can read mock_orders"
ON public.mock_orders
FOR SELECT
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can update mock_orders"
ON public.mock_orders
FOR UPDATE
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete mock_orders"
ON public.mock_orders
FOR DELETE
USING (auth.role() = 'service_role');