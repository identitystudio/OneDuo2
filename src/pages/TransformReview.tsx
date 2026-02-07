import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  FileText,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Download,
  Clock,
  MousePointer,
  Type,
  ZoomIn,
  Timer,
  BookOpen,
  Lock
} from "lucide-react";
import { VerificationGate } from "@/components/VerificationGate";
import { ReasoningLogPanel } from "@/components/ReasoningLogPanel";
import { CommandReference } from "@/components/CommandReference";

interface ArtifactFrame {
  id: string;
  artifact_id: string;
  frame_index: number;
  timestamp_ms: number;
  screenshot_url: string | null;
  ocr_text: string | null;
  cursor_pause: boolean;
  text_selected: boolean;
  zoom_focus: boolean;
  lingering_frame: boolean;
  confidence_score: number;
  confidence_level: string;
  is_critical: boolean;
  created_at: string;
  verification_approvals?: {
    action: string;
    created_at: string;
    user_id: string;
  }[];
}

export default function TransformReview() {
  const { artifactId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedFrame, setSelectedFrame] = useState<ArtifactFrame | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("frames");
  const [hasPendingDecisions, setHasPendingDecisions] = useState(false);
  const [autoOpenedGate, setAutoOpenedGate] = useState(false);

  // Fetch artifact
  const { data: artifact, isLoading: artifactLoading } = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transformation_artifacts")
        .select("*")
        .eq("id", artifactId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!artifactId,
  });

  // Fetch frames with verification approvals
  const { data: frames, isLoading: framesLoading } = useQuery({
    queryKey: ["artifact-frames", artifactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artifact_frames")
        .select(`
          *,
          verification_approvals (
            action,
            created_at,
            user_id
          )
        `)
        .eq("artifact_id", artifactId)
        .order("frame_index");

      if (error) throw error;
      return data as ArtifactFrame[];
    },
    enabled: !!artifactId,
  });

  const formatTimestamp = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case "HIGH": return "bg-green-500";
      case "MEDIUM": return "bg-amber-500";
      case "LOW": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  const needsVerification = (frame: ArtifactFrame) => {
    if (frame.confidence_level === "LOW" || frame.is_critical) {
      const hasApproval = frame.verification_approvals?.some(v => v.action === "APPROVED");
      const hasRejection = frame.verification_approvals?.some(v => v.action === "REJECTED");
      return !hasApproval && !hasRejection;
    }
    return false;
  };

  const getApprovalStatus = (frame: ArtifactFrame) => {
    const approval = frame.verification_approvals?.find(v => v.action === "APPROVED");
    const rejection = frame.verification_approvals?.find(v => v.action === "REJECTED");
    if (approval) return "approved";
    if (rejection) return "rejected";
    return null;
  };

  const filteredFrames = frames?.filter(frame => {
    switch (filter) {
      case "high": return frame.confidence_level === "HIGH";
      case "medium-plus": return frame.confidence_level === "HIGH" || frame.confidence_level === "MEDIUM";
      case "critical": return frame.is_critical;
      case "needs-verification": return needsVerification(frame);
      default: return true;
    }
  });

  const handleGeneratePDF = async () => {
    setGeneratingPDF(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-artifact-pdf", {
        body: { artifactId },
      });

      if (error) throw error;

      if (data?.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
        toast.success(`PDF generated with ${data.includedFrames} of ${data.totalFrames} frames`);
      }
    } catch (error) {
      console.error("Generate PDF error:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setGeneratingPDF(false);
    }
  };

  const stats = {
    total: frames?.length || 0,
    high: frames?.filter(f => f.confidence_level === "HIGH").length || 0,
    medium: frames?.filter(f => f.confidence_level === "MEDIUM").length || 0,
    low: frames?.filter(f => f.confidence_level === "LOW").length || 0,
    critical: frames?.filter(f => f.is_critical).length || 0,
    needsVerification: frames?.filter(f => needsVerification(f)).length || 0,
    approved: frames?.filter(f => getApprovalStatus(f) === "approved").length || 0,
    rejected: frames?.filter(f => getApprovalStatus(f) === "rejected").length || 0,
  };

  const canGeneratePDF = !hasPendingDecisions && stats.needsVerification === 0;

  // Auto-open Verification Gate for first critical frame that needs verification
  // This implements the patent's "sovereignty check" - forcing human review
  React.useEffect(() => {
    if (!autoOpenedGate && frames && frames.length > 0) {
      const firstCriticalUnapproved = frames.find(f => needsVerification(f));
      if (firstCriticalUnapproved) {
        setSelectedFrame(firstCriticalUnapproved);
        setVerificationOpen(true);
        setAutoOpenedGate(true);
        toast.info(
          `${stats.needsVerification} critical step(s) require your approval before PDF generation`,
          { duration: 5000 }
        );
      }
    }
  }, [frames, autoOpenedGate, stats.needsVerification]);

  if (artifactLoading || framesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading artifact...</p>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Artifact Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The artifact you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => navigate("/transform")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Transform
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }







  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/transform")} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Transform
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{artifact.video_title}</h1>
              <p className="text-muted-foreground">
                {artifact.frame_count} frames • {artifact.key_moments} key moments • {formatTimestamp(artifact.duration_seconds * 1000)} duration
              </p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button
                      onClick={handleGeneratePDF}
                      disabled={generatingPDF || !canGeneratePDF}
                    >
                      {!canGeneratePDF ? (
                        <Lock className="mr-2 h-4 w-4" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      {generatingPDF ? "Generating..." : "Generate PDF"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canGeneratePDF && (
                  <TooltipContent>
                    <p>
                      {hasPendingDecisions
                        ? "Lock all reasoning decisions before generating PDF"
                        : "Review all critical frames before generating PDF"}
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Main Tabs: Frames vs Reasoning Log */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="frames">
              <FileText className="mr-2 h-4 w-4" />
              Frames ({stats.total})
            </TabsTrigger>
            <TabsTrigger value="reasoning" className="relative">
              <BookOpen className="mr-2 h-4 w-4" />
              Reasoning Log
              {hasPendingDecisions && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="frames" className="mt-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-green-500">{stats.high}</p>
                  <p className="text-xs text-muted-foreground">HIGH Confidence</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-amber-500">{stats.medium}</p>
                  <p className="text-xs text-muted-foreground">MEDIUM Confidence</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-red-500">{stats.critical}</p>
                  <p className="text-xs text-muted-foreground">CRITICAL Steps</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-primary">{stats.needsVerification}</p>
                  <p className="text-xs text-muted-foreground">Needs Verification</p>
                </CardContent>
              </Card>
            </div>

            {/* Filter Tabs */}
            <Tabs value={filter} onValueChange={setFilter} className="mb-6">
              <TabsList>
                <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="high">HIGH ({stats.high})</TabsTrigger>
                <TabsTrigger value="medium-plus">MEDIUM+ ({stats.high + stats.medium})</TabsTrigger>
                <TabsTrigger value="critical">CRITICAL ({stats.critical})</TabsTrigger>
                <TabsTrigger value="needs-verification" className="text-red-500">
                  Needs Verification ({stats.needsVerification})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Frames List */}
            <Card>
              <CardHeader>
                <CardTitle>Extracted Frames</CardTitle>
                <CardDescription>
                  Review each frame and approve critical steps before generating the PDF artifact
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-3">
                    {filteredFrames?.map((frame) => {
                      const status = getApprovalStatus(frame);
                      const requiresVerification = needsVerification(frame);

                      return (
                        <div
                          key={frame.id}
                          className={`p-4 border rounded-lg transition-colors ${status === "rejected"
                            ? "border-red-500/50 bg-red-500/5 opacity-50"
                            : status === "approved"
                              ? "border-green-500/50 bg-green-500/5"
                              : requiresVerification
                                ? "border-amber-500/50 bg-amber-500/5"
                                : "hover:bg-muted/50"
                            }`}
                        >
                          <div className="flex items-start gap-4">
                            {/* Frame Thumbnail Placeholder */}
                            <div className="w-20 h-14 bg-muted rounded flex items-center justify-center shrink-0">
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            </div>

                            {/* Frame Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">#{frame.frame_index}</span>
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                  {formatTimestamp(frame.timestamp_ms)}
                                </span>

                                {/* Confidence Badge */}
                                <Badge
                                  className={`${getConfidenceColor(frame.confidence_level)} text-white`}
                                >
                                  {Math.round(frame.confidence_score * 100)}% {frame.confidence_level}
                                </Badge>

                                {frame.is_critical && (
                                  <Badge variant="destructive">CRITICAL</Badge>
                                )}

                                {/* Approval Status */}
                                {status === "approved" && (
                                  <Badge className="bg-green-500 text-white">
                                    <CheckCircle className="mr-1 h-3 w-3" />
                                    BLESSED
                                  </Badge>
                                )}
                                {status === "rejected" && (
                                  <Badge variant="destructive">
                                    <XCircle className="mr-1 h-3 w-3" />
                                    REJECTED
                                  </Badge>
                                )}
                              </div>

                              {/* OCR Text */}
                              <p className="text-sm mb-2 truncate">
                                {frame.ocr_text || "(no text detected)"}
                              </p>

                              {/* Emphasis Flags */}
                              <div className="flex flex-wrap gap-1">
                                {frame.cursor_pause && (
                                  <Badge variant="outline" className="text-xs">
                                    <MousePointer className="mr-1 h-3 w-3" />
                                    Cursor Pause
                                  </Badge>
                                )}
                                {frame.text_selected && (
                                  <Badge variant="outline" className="text-xs">
                                    <Type className="mr-1 h-3 w-3" />
                                    Text Selected
                                  </Badge>
                                )}
                                {frame.zoom_focus && (
                                  <Badge variant="outline" className="text-xs">
                                    <ZoomIn className="mr-1 h-3 w-3" />
                                    Zoom Focus
                                  </Badge>
                                )}
                                {frame.lingering_frame && (
                                  <Badge variant="outline" className="text-xs">
                                    <Timer className="mr-1 h-3 w-3" />
                                    Lingering
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Action Button */}
                            <div className="shrink-0">
                              {requiresVerification ? (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setSelectedFrame(frame);
                                    setVerificationOpen(true);
                                  }}
                                >
                                  <Shield className="mr-1 h-4 w-4" />
                                  Review Required
                                </Button>
                              ) : status === "approved" || status === "rejected" ? null : (
                                <Checkbox
                                  checked={true}
                                  disabled
                                  className="mt-2"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredFrames?.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No frames match the current filter
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reasoning" className="mt-6 space-y-4">
            <CommandReference />
            <Card>
              <CardHeader>
                <CardTitle>Multi-Model Reasoning Ledger</CardTitle>
                <CardDescription>
                  Record observations from AI sessions and lock human governance decisions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReasoningLogPanel
                  artifactId={artifactId!}
                  onPendingChange={setHasPendingDecisions}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Verification Gate Dialog */}
        {selectedFrame && (
          <VerificationGate
            frame={selectedFrame}
            open={verificationOpen}
            onOpenChange={setVerificationOpen}
          />
        )}
      </div>
    </div>
  );
}
