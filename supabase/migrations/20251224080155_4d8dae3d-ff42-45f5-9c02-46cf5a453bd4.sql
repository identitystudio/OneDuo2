-- =============================================
-- ADDITIONAL SECURITY HARDENERS
-- =============================================

-- 1. ADD SHARE TOKEN FOR PUBLIC COURSE ACCESS
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN DEFAULT false;

-- Index for fast share token lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_share_token ON public.courses(share_token);

-- 2. RECREATE PUBLIC_COURSES VIEW TO REQUIRE SHARE TOKEN
DROP VIEW IF EXISTS public.public_courses;

-- Public view now requires share_enabled = true and returns only safe fields
CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS
SELECT 
  id,
  share_token,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  created_at
FROM public.courses
WHERE status = 'completed' 
  AND share_enabled = true;

GRANT SELECT ON public.public_courses TO anon, authenticated;

-- 3. CREATE FUNCTION TO GET COURSE BY SHARE TOKEN (for public /view/:id pages)
CREATE OR REPLACE FUNCTION public.get_course_by_share_token(p_share_token UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  video_duration_seconds NUMERIC,
  is_multi_module BOOLEAN,
  module_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.title,
    c.description,
    c.video_duration_seconds,
    c.is_multi_module,
    c.module_count,
    c.created_at
  FROM public.courses c
  WHERE c.share_token = p_share_token
    AND c.status = 'completed'
    AND c.share_enabled = true;
END;
$$;

-- 4. STRENGTHEN OWNERSHIP - user_id primary, email_hash only for legacy
CREATE OR REPLACE FUNCTION public.user_owns_course_strict(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND (
        -- Primary: user_id must match (strongest check)
        user_id = auth.uid()
        -- Legacy fallback: only if user_id is NULL (old data before auth)
        OR (user_id IS NULL AND email_hash = public.hash_email(auth.email()))
      )
  )
$$;

-- 5. ENABLE SHARE BY DEFAULT FOR EXISTING COMPLETED COURSES
UPDATE public.courses 
SET share_enabled = true 
WHERE status = 'completed' AND share_enabled IS NULL;

-- 6. FUNCTION TO TOGGLE SHARING (for owner use)
CREATE OR REPLACE FUNCTION public.toggle_course_sharing(p_course_id UUID, p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify ownership first
  IF NOT public.user_owns_course_strict(p_course_id) THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.courses
  SET share_enabled = p_enabled
  WHERE id = p_course_id;
  
  RETURN TRUE;
END;
$$;

-- 7. REGENERATE SHARE TOKEN (if user wants a new link)
CREATE OR REPLACE FUNCTION public.regenerate_share_token(p_course_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_token UUID;
BEGIN
  -- Verify ownership first
  IF NOT public.user_owns_course_strict(p_course_id) THEN
    RETURN NULL;
  END IF;
  
  v_new_token := gen_random_uuid();
  
  UPDATE public.courses
  SET share_token = v_new_token
  WHERE id = p_course_id;
  
  RETURN v_new_token;
END;
$$;