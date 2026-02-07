-- Add enhanced analytics columns to artifact_access_log
ALTER TABLE public.artifact_access_log 
ADD COLUMN IF NOT EXISTS download_source text, -- 'email', 'dashboard', 'direct'
ADD COLUMN IF NOT EXISTS referrer text,
ADD COLUMN IF NOT EXISTS download_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS module_id uuid,
ADD COLUMN IF NOT EXISTS session_fingerprint text; -- For abuse detection

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_artifact_access_course_time 
ON public.artifact_access_log(course_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_access_accessor 
ON public.artifact_access_log(accessor_hash, accessed_at DESC);

-- Create view for download analytics dashboard
CREATE OR REPLACE VIEW public.download_analytics AS
SELECT 
  course_id,
  DATE_TRUNC('day', accessed_at) as download_date,
  COUNT(*) as total_accesses,
  COUNT(DISTINCT accessor_hash) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE access_type = 'download') as downloads,
  COUNT(*) FILTER (WHERE access_type = 'signed_url') as url_generations
FROM public.artifact_access_log
GROUP BY course_id, DATE_TRUNC('day', accessed_at);

-- Restrict view to service role only
REVOKE ALL ON public.download_analytics FROM anon, authenticated;
GRANT SELECT ON public.download_analytics TO service_role;