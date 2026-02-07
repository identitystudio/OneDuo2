-- Fix the security definer view issue by setting SECURITY INVOKER
ALTER VIEW public.public_courses SET (security_invoker = true);