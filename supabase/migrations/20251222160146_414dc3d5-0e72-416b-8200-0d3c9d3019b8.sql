-- Enable RLS on the public_courses view (views inherit RLS from base table)
-- The view is safe because it explicitly excludes email column
-- But let's add explicit grant controls

-- Revoke direct table access from anon to ensure they go through RLS
REVOKE SELECT ON public.courses FROM anon;

-- The public_courses view is intentionally public for completed courses catalog
-- It excludes email and sensitive fields by design

-- Add comment documenting security rationale
COMMENT ON VIEW public.public_courses IS 'Public course catalog - intentionally excludes email and sensitive data. Only shows completed courses.';