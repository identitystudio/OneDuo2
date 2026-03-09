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
import { Shield, AlertTriangle, CheckCircle, XCircle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

async function generateApprovalSignature(frameId: string, artifactId: string, userId: string): Promise<string> {
  const timestamp = Date.now().toString();
  const payload = `${frameId}:${artifactId}:${userId}:${timestamp}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return `GOV-${hashHex.substring(0, 40).toUpperCase()}`;
}

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
  const [approvedSignature, setApprovedSignature] = useState<string | null>(null);
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

      const signature = await generateApprovalSignature(frame.id, frame.artifact_id, user.id);

      // Route through edge function so server can compute + store HMAC for tamper detection
      const { error } = await supabase.functions.invoke("approve-governance-frame", {
        body: {
          artifact_id: frame.artifact_id,
          frame_id: frame.id,
          action: "APPROVED",
          approval_signature: signature,
        },
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["artifact-frames", frame.artifact_id] });
      setApprovedSignature(signature);
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
      // Route through edge function so server HMAC is recorded for rejected frames too
      const { error } = await supabase.functions.invoke("approve-governance-frame", {
        body: {
          artifact_id: frame.artifact_id,
          frame_id: frame.id,
          action: "REJECTED",
          reason: rejectionReason || "No reason provided",
        },
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

  const handleClose = () => {
    setApprovedSignature(null);
    setRejectionReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {approvedSignature ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                Step Approved & Blessed
              </DialogTitle>
              <DialogDescription className="sr-only">
                Approval signature generated
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <Shield className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-600 dark:text-green-400">
                    Human-Origin Approval Recorded
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Frame #{frame.frame_index} has been authorized and signed.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Approval Signature</p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-xs break-all">
                  <span className="flex-1 text-green-500">{approvedSignature}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(approvedSignature);
                      toast.success("Signature copied");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This signature is stored with the approval record as proof of human authorization.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="w-full">
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
