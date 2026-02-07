import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ArtifactFrame {
  id: string;
  artifact_id: string;
  frame_index: number;
  timestamp_ms: number;
  ocr_text: string | null;
  cursor_pause: boolean;
  text_selected: boolean;
  zoom_focus: boolean;
  lingering_frame: boolean;
  confidence_score: number;
  confidence_level: string;
  is_critical: boolean;
}

interface VerificationGateProps {
  frame: ArtifactFrame;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VerificationGate({ frame, open, onOpenChange }: VerificationGateProps) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const formatTimestamp = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("verification_approvals").insert({
        artifact_id: frame.artifact_id,
        frame_id: frame.id,
        user_id: user.id,
        action: "APPROVED",
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["artifact-frames", frame.artifact_id] });
      toast.success("Step approved and blessed");
      onOpenChange(false);
    } catch (error) {
      console.error("Approve error:", error);
      toast.error("Failed to approve step");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("verification_approvals").insert({
        artifact_id: frame.artifact_id,
        frame_id: frame.id,
        user_id: user.id,
        action: "REJECTED",
        reason: rejectionReason || "No reason provided",
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["artifact-frames", frame.artifact_id] });
      toast.success("Step rejected and excluded from artifact");
      onOpenChange(false);
    } catch (error) {
      console.error("Reject error:", error);
      toast.error("Failed to reject step");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Shield className="h-5 w-5" />
            VERIFICATION GATE ACTIVATED
          </DialogTitle>
          <DialogDescription className="sr-only">
            Human verification required for this step
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Alert Banner */}
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">
                This step requires Human-Origin Approval
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                AI execution cannot proceed without your explicit authorization.
              </p>
            </div>
          </div>

          <Separator />

          {/* Frame Details */}
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Step Details</p>
              <p className="font-medium">
                Frame #{frame.frame_index} at {formatTimestamp(frame.timestamp_ms)}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Detected Action</p>
              <p className="font-medium text-lg">"{frame.ocr_text || "No text detected"}"</p>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Confidence:</p>
              <Badge
                variant={
                  frame.confidence_level === "HIGH"
                    ? "default"
                    : frame.confidence_level === "MEDIUM"
                    ? "secondary"
                    : "destructive"
                }
              >
                {Math.round(frame.confidence_score * 100)}% ({frame.confidence_level})
              </Badge>
              {frame.is_critical && (
                <Badge variant="destructive">CRITICAL</Badge>
              )}
            </div>

            {/* Emphasis Flags */}
            <div className="flex flex-wrap gap-2">
              {frame.cursor_pause && (
                <Badge variant="outline" className="text-xs">Cursor Pause</Badge>
              )}
              {frame.text_selected && (
                <Badge variant="outline" className="text-xs">Text Selected</Badge>
              )}
              {frame.zoom_focus && (
                <Badge variant="outline" className="text-xs">Zoom Focus</Badge>
              )}
              {frame.lingering_frame && (
                <Badge variant="outline" className="text-xs">Lingering</Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Sovereignty Statement */}
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p className="font-medium text-foreground mb-1">Sovereignty Check</p>
            <p>
              The system cannot proceed without your explicit authorization.
              Confirm this step matches your demonstrated intent.
            </p>
          </div>

          {/* Rejection Reason */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Rejection reason (optional)
            </p>
            <Textarea
              placeholder="Explain why this step should be excluded..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="h-20"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isSubmitting}
            className="flex-1"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject / Stop
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isSubmitting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Approve & Bless
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
