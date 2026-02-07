-- ============================================
-- IMPLEMENTATION LAYER: Structured Execution Steps
-- Extends existing governance infrastructure
-- ============================================

-- 1. implementation_steps: AI-proposed, human-approved atomic steps
CREATE TABLE public.implementation_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE,
  
  -- Step identification
  step_number INTEGER NOT NULL,
  step_title TEXT NOT NULL,
  step_description TEXT,
  
  -- Timing anchor (links to source frame evidence)
  source_frame_id UUID REFERENCES public.artifact_frames(id),
  timestamp_start_ms INTEGER,
  timestamp_end_ms INTEGER,
  
  -- Extraction metadata
  extracted_by TEXT NOT NULL DEFAULT 'ai', -- 'ai' or 'human'
  extraction_confidence NUMERIC(3,2) CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  
  -- Human approval status (Governance-Gated)
  approval_status TEXT NOT NULL DEFAULT 'proposed' CHECK (approval_status IN ('proposed', 'approved', 'rejected', 'superseded')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Enforceable once approved
  is_enforceable BOOLEAN GENERATED ALWAYS AS (approval_status = 'approved') STORED,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(artifact_id, step_number)
);

-- 2. step_dependencies: Conditional logic (if X → then Y)
CREATE TABLE public.step_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- The step that has the dependency
  dependent_step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  
  -- The prerequisite step that must be completed first
  prerequisite_step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  
  -- Dependency type
  dependency_type TEXT NOT NULL DEFAULT 'prerequisite' CHECK (dependency_type IN (
    'prerequisite',     -- Must complete before
    'conditional',      -- If X then Y
    'blocking',         -- Hard block, cannot skip
    'recommended'       -- Soft dependency, can skip with warning
  )),
  
  -- Conditional logic (if dependency_type = 'conditional')
  condition_expression TEXT, -- e.g., "step.output.success = true"
  condition_description TEXT, -- Human-readable: "Only if previous step succeeded"
  
  -- Approval status (dependencies also need human approval)
  approval_status TEXT NOT NULL DEFAULT 'proposed' CHECK (approval_status IN ('proposed', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent circular dependencies at constraint level
  CHECK (dependent_step_id != prerequisite_step_id)
);

-- 3. step_constraints: Gotchas, exceptions, warnings
CREATE TABLE public.step_constraints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  
  -- Constraint classification
  constraint_type TEXT NOT NULL CHECK (constraint_type IN (
    'prerequisite',     -- Must have X before doing this
    'warning',          -- Gotcha / common mistake
    'exception',        -- Edge case handling
    'timing',           -- Must do within X time
    'order',            -- Must do in specific sequence
    'environment',      -- Requires specific setup
    'validation'        -- How to verify completion
  )),
  
  -- Constraint details
  constraint_title TEXT NOT NULL,
  constraint_description TEXT NOT NULL,
  
  -- Severity (affects enforcement)
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  
  -- Evidence linking
  source_frame_id UUID REFERENCES public.artifact_frames(id),
  source_timestamp_ms INTEGER,
  source_text TEXT, -- The OCR or transcript text that surfaced this
  
  -- AI extraction metadata
  extraction_confidence NUMERIC(3,2),
  
  -- Human approval
  approval_status TEXT NOT NULL DEFAULT 'proposed' CHECK (approval_status IN ('proposed', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. step_completions: User progress tracking with governance gating
CREATE TABLE public.step_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- What was completed
  step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Completion status
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'in_progress', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  
  -- Skip governance (requires execution_frame if skipping prerequisites)
  skipped_prerequisites BOOLEAN NOT NULL DEFAULT false,
  skip_frame_id UUID REFERENCES public.execution_frames(id), -- Required if skipping
  skip_reason TEXT,
  
  -- User notes / verification
  completion_notes TEXT,
  verification_evidence TEXT, -- Optional proof of completion
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(step_id, user_id)
);

-- ============================================
-- ENFORCEMENT: Block progression without prerequisites
-- ============================================

-- Function to check if user can progress to a step
CREATE OR REPLACE FUNCTION public.can_progress_to_step(
  p_step_id UUID,
  p_user_id UUID
) RETURNS TABLE(
  allowed BOOLEAN,
  missing_prerequisites UUID[],
  blocking_constraints TEXT[],
  requires_frame BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_missing UUID[];
  v_blocking TEXT[];
BEGIN
  -- Find incomplete prerequisite steps (only approved dependencies count)
  SELECT ARRAY_AGG(sd.prerequisite_step_id) INTO v_missing
  FROM public.step_dependencies sd
  LEFT JOIN public.step_completions sc 
    ON sc.step_id = sd.prerequisite_step_id 
    AND sc.user_id = p_user_id
    AND sc.status = 'completed'
  WHERE sd.dependent_step_id = p_step_id
    AND sd.approval_status = 'approved'
    AND sd.dependency_type IN ('prerequisite', 'blocking')
    AND sc.id IS NULL; -- Not completed
  
  -- Find critical constraints that haven't been acknowledged
  SELECT ARRAY_AGG(c.constraint_title) INTO v_blocking
  FROM public.step_constraints c
  WHERE c.step_id = p_step_id
    AND c.approval_status = 'approved'
    AND c.severity = 'critical';
  
  v_missing := COALESCE(v_missing, ARRAY[]::UUID[]);
  v_blocking := COALESCE(v_blocking, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT 
    (array_length(v_missing, 1) IS NULL OR array_length(v_missing, 1) = 0),
    v_missing,
    v_blocking,
    (array_length(v_missing, 1) IS NOT NULL AND array_length(v_missing, 1) > 0);
END;
$$;

-- Function to complete a step (with governance check)
CREATE OR REPLACE FUNCTION public.complete_implementation_step(
  p_step_id UUID,
  p_user_id UUID,
  p_skip_prerequisites BOOLEAN DEFAULT false,
  p_skip_frame_id UUID DEFAULT NULL,
  p_skip_reason TEXT DEFAULT NULL,
  p_completion_notes TEXT DEFAULT NULL
) RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  completion_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_can_progress RECORD;
  v_completion_id UUID;
BEGIN
  -- Check if step is enforceable (approved)
  IF NOT EXISTS (
    SELECT 1 FROM public.implementation_steps 
    WHERE id = p_step_id AND is_enforceable = true
  ) THEN
    RETURN QUERY SELECT false, 'Step is not yet approved for enforcement'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Check prerequisites
  SELECT * INTO v_can_progress FROM public.can_progress_to_step(p_step_id, p_user_id);
  
  IF NOT v_can_progress.allowed THEN
    -- User is trying to skip prerequisites
    IF NOT p_skip_prerequisites THEN
      RETURN QUERY SELECT false, 
        ('Prerequisites not met: ' || array_to_string(v_can_progress.missing_prerequisites::text[], ', '))::TEXT,
        NULL::UUID;
      RETURN;
    END IF;
    
    -- Governance gate: require execution_frame to skip
    IF p_skip_frame_id IS NULL THEN
      RETURN QUERY SELECT false, 
        'GOVERNANCE REQUIRED: Skipping prerequisites requires an approved execution_frame'::TEXT,
        NULL::UUID;
      RETURN;
    END IF;
    
    -- Verify the frame is approved
    IF NOT EXISTS (
      SELECT 1 FROM public.execution_frames 
      WHERE id = p_skip_frame_id 
        AND approval_status = 'approved'
        AND executed = true
    ) THEN
      RETURN QUERY SELECT false,
        'GOVERNANCE VIOLATION: execution_frame is not approved'::TEXT,
        NULL::UUID;
      RETURN;
    END IF;
  END IF;
  
  -- Insert or update completion
  INSERT INTO public.step_completions (
    step_id, user_id, status, completed_at,
    skipped_prerequisites, skip_frame_id, skip_reason, completion_notes
  ) VALUES (
    p_step_id, p_user_id, 'completed', now(),
    p_skip_prerequisites, p_skip_frame_id, p_skip_reason, p_completion_notes
  )
  ON CONFLICT (step_id, user_id) DO UPDATE SET
    status = 'completed',
    completed_at = now(),
    skipped_prerequisites = EXCLUDED.skipped_prerequisites,
    skip_frame_id = EXCLUDED.skip_frame_id,
    skip_reason = EXCLUDED.skip_reason,
    completion_notes = EXCLUDED.completion_notes,
    updated_at = now()
  RETURNING id INTO v_completion_id;
  
  RETURN QUERY SELECT true, NULL::TEXT, v_completion_id;
END;
$$;

-- ============================================
-- INDEXES for performance
-- ============================================

CREATE INDEX idx_implementation_steps_artifact ON public.implementation_steps(artifact_id);
CREATE INDEX idx_implementation_steps_approval ON public.implementation_steps(approval_status);
CREATE INDEX idx_step_dependencies_dependent ON public.step_dependencies(dependent_step_id);
CREATE INDEX idx_step_dependencies_prerequisite ON public.step_dependencies(prerequisite_step_id);
CREATE INDEX idx_step_constraints_step ON public.step_constraints(step_id);
CREATE INDEX idx_step_completions_user ON public.step_completions(user_id);
CREATE INDEX idx_step_completions_step ON public.step_completions(step_id);

-- ============================================
-- RLS: User can only see/modify their own completions
-- ============================================

ALTER TABLE public.implementation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_completions ENABLE ROW LEVEL SECURITY;

-- Steps are readable by artifact owners (transformation_artifacts has user_id directly)
CREATE POLICY "View steps for owned artifacts" ON public.implementation_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.transformation_artifacts ta
      WHERE ta.id = artifact_id
        AND ta.user_id = auth.uid()
    )
  );

CREATE POLICY "View dependencies for owned artifacts" ON public.step_dependencies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.implementation_steps s
      JOIN public.transformation_artifacts ta ON ta.id = s.artifact_id
      WHERE s.id = dependent_step_id
        AND ta.user_id = auth.uid()
    )
  );

CREATE POLICY "View constraints for owned artifacts" ON public.step_constraints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.implementation_steps s
      JOIN public.transformation_artifacts ta ON ta.id = s.artifact_id
      WHERE s.id = step_id
        AND ta.user_id = auth.uid()
    )
  );

-- Users manage their own completions
CREATE POLICY "Users manage own completions" ON public.step_completions
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- TRIGGER: updated_at
-- ============================================

CREATE TRIGGER update_implementation_steps_updated_at
  BEFORE UPDATE ON public.implementation_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_step_completions_updated_at
  BEFORE UPDATE ON public.step_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();