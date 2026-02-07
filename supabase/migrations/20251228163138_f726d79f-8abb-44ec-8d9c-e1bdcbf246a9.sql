-- Create transformation_artifacts table
CREATE TABLE public.transformation_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_title text NOT NULL,
  video_url text NOT NULL,
  storage_path text,
  duration_seconds integer NOT NULL DEFAULT 0,
  frame_count integer NOT NULL DEFAULT 0,
  key_moments integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create artifact_frames table
CREATE TABLE public.artifact_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE NOT NULL,
  frame_index integer NOT NULL,
  timestamp_ms integer NOT NULL,
  screenshot_url text,
  ocr_text text,
  cursor_pause boolean DEFAULT false,
  text_selected boolean DEFAULT false,
  zoom_focus boolean DEFAULT false,
  lingering_frame boolean DEFAULT false,
  confidence_score decimal(3,2) NOT NULL DEFAULT 0,
  confidence_level text NOT NULL DEFAULT 'LOW',
  is_critical boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create verification_approvals table
CREATE TABLE public.verification_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE NOT NULL,
  frame_id uuid REFERENCES public.artifact_frames(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.transformation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_approvals ENABLE ROW LEVEL SECURITY;

-- RLS policies for transformation_artifacts
CREATE POLICY "Users can view own artifacts"
  ON public.transformation_artifacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own artifacts"
  ON public.transformation_artifacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own artifacts"
  ON public.transformation_artifacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own artifacts"
  ON public.transformation_artifacts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to transformation_artifacts"
  ON public.transformation_artifacts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS policies for artifact_frames
CREATE POLICY "Users can view own frames"
  ON public.artifact_frames FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.transformation_artifacts
      WHERE id = artifact_frames.artifact_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to artifact_frames"
  ON public.artifact_frames FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS policies for verification_approvals
CREATE POLICY "Users can view own approvals"
  ON public.verification_approvals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own approvals"
  ON public.verification_approvals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to verification_approvals"
  ON public.verification_approvals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create updated_at trigger for transformation_artifacts
CREATE TRIGGER update_transformation_artifacts_updated_at
  BEFORE UPDATE ON public.transformation_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_artifact_frames_artifact_id ON public.artifact_frames(artifact_id);
CREATE INDEX idx_verification_approvals_artifact_id ON public.verification_approvals(artifact_id);
CREATE INDEX idx_verification_approvals_frame_id ON public.verification_approvals(frame_id);