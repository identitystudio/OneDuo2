-- Drop the permissive policy that allows unrestricted access
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Recreate with proper service_role restriction
CREATE POLICY "email_subscribers_service_role_only"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');