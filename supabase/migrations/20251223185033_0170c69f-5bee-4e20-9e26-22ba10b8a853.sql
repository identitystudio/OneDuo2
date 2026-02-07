-- Add team notification email to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS team_notification_email text,
ADD COLUMN IF NOT EXISTS team_notification_role text,
ADD COLUMN IF NOT EXISTS team_notified_at timestamptz,
ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;

-- Add comment for clarity
COMMENT ON COLUMN public.courses.team_notification_email IS 'Optional email to notify when PDF is ready (VA, team member, etc)';
COMMENT ON COLUMN public.courses.team_notification_role IS 'Role label for team member (VA, Designer, Ops, Partner)';
COMMENT ON COLUMN public.courses.team_notified_at IS 'When the team member was notified';
COMMENT ON COLUMN public.courses.owner_notified_at IS 'When the owner was notified that PDF is ready';