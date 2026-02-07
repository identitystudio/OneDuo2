-- Add source_role column for Trinity Roles (Governor, Engineer, Architect)
ALTER TABLE public.reasoning_logs 
ADD COLUMN source_role text;

-- Add comment explaining the allowed values
COMMENT ON COLUMN public.reasoning_logs.source_role IS 'Trinity Role: ROLE_GOVERNOR (risk/ethics), ROLE_ENGINEER (execution/logic), ROLE_ARCHITECT (structure/scaling), or NULL for non-role entries';