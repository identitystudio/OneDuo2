-- Drop all existing policies on mock_orders
DROP POLICY IF EXISTS "Rate limited mock order creation" ON public.mock_orders;
DROP POLICY IF EXISTS "Service role can delete mock_orders" ON public.mock_orders;
DROP POLICY IF EXISTS "Service role can read mock_orders" ON public.mock_orders;
DROP POLICY IF EXISTS "Service role can update mock_orders" ON public.mock_orders;

-- Block all non-service access
CREATE POLICY "Block non-service access to mock_orders"
ON public.mock_orders
FOR ALL
USING (false)
WITH CHECK (false);

-- Allow service role full access
CREATE POLICY "Service role only for mock_orders"
ON public.mock_orders
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');