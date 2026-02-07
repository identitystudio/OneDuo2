-- Create reasoning_logs table for Multi-Model Reasoning Ledger
CREATE TABLE public.reasoning_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('AI', 'Human', 'System')),
  source_label TEXT NOT NULL,
  analysis_focus TEXT NOT NULL CHECK (analysis_focus IN ('Visual', 'Logical', 'Risk', 'Process', 'Performance', 'Other')),
  summary TEXT NOT NULL,
  concern_level TEXT NOT NULL DEFAULT 'None' CHECK (concern_level IN ('None', 'Low', 'Medium', 'High', 'Critical')),
  recommendation TEXT,
  human_decision TEXT NOT NULL DEFAULT 'Pending' CHECK (human_decision IN ('Pending', 'Accepted', 'Modified', 'Rejected')),
  decision_notes TEXT,
  superseded_by UUID REFERENCES public.reasoning_logs(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_reasoning_logs_artifact_id ON public.reasoning_logs(artifact_id);
CREATE INDEX idx_reasoning_logs_created_at ON public.reasoning_logs(created_at);

-- Enable RLS
ALTER TABLE public.reasoning_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view reasoning logs for artifacts they own
CREATE POLICY "Users can view reasoning logs for their artifacts"
ON public.reasoning_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
);

-- Users can insert reasoning logs for artifacts they own (append-only)
CREATE POLICY "Users can add reasoning logs to their artifacts"
ON public.reasoning_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
);

-- Users can only update human_decision and decision_notes (not the reasoning itself)
CREATE POLICY "Users can lock decisions on their reasoning logs"
ON public.reasoning_logs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
);

-- Service role has full access
CREATE POLICY "Service role has full access to reasoning logs"
ON public.reasoning_logs
FOR ALL
USING (auth.role() = 'service_role');

-- Create function to check if artifact can be finalized (all decisions locked)
CREATE OR REPLACE FUNCTION public.can_finalize_artifact(p_artifact_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.reasoning_logs
    WHERE artifact_id = p_artifact_id
    AND human_decision = 'Pending'
    AND superseded_by IS NULL
  )
$$;