import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Copy,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft
} from "lucide-react";

interface ArtifactWithCounts {
  id: string;
  user_id: string;
  video_title: string;
  video_url: string;
  duration_seconds: number;
  frame_count: number;
  key_moments: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function Artifacts() {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch user's artifacts
  const { data: artifacts, isLoading } = useQuery({
    queryKey: ["user-artifacts-all"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("transformation_artifacts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ArtifactWithCounts[];
    },
  });

  // Fetch approvals for expanded artifact
  const { data: approvals } = useQuery({
    queryKey: ["approvals", expandedId],
    queryFn: async () => {
      if (!expandedId) return [];

      const { data, error } = await supabase
        .from("verification_approvals")
        .select(`
          *,
          artifact_frames (
            frame_index,
            ocr_text,
            confidence_level
          )
        `)
        .eq("artifact_id", expandedId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!expandedId,
  });

  // Fetch frame stats for expanded artifact
  const { data: frameStats } = useQuery({
    queryKey: ["frame-stats", expandedId],
    queryFn: async () => {
      if (!expandedId) return null;

      const { data, error } = await supabase
        .from("artifact_frames")
        .select("confidence_level, is_critical")
        .eq("artifact_id", expandedId);

      if (error) throw error;

      return {
        total: data.length,
        high: data.filter(f => f.confidence_level === "HIGH").length,
        medium: data.filter(f => f.confidence_level === "MEDIUM").length,
        low: data.filter(f => f.confidence_level === "LOW").length,
        critical: data.filter(f => f.is_critical).length,
      };
    },
    enabled: !!expandedId,
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (artifact: ArtifactWithCounts) => {
    const approvedCount = approvals?.filter(a => a.action === "APPROVED").length || 0;
    const rejectedCount = approvals?.filter(a => a.action === "REJECTED").length || 0;

    if (artifact.status === "processing") {
      return <Badge variant="secondary">Processing</Badge>;
    }
    if (rejectedCount > 0 && approvedCount > 0) {
      return <Badge className="bg-amber-500">Partially Blocked</Badge>;
    }
    if (approvedCount > 0) {
      return <Badge className="bg-green-500">Approved</Badge>;
    }
    return <Badge>Generated</Badge>;
  };

  const handleDownloadPDF = async (artifactId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-artifact-pdf", {
        body: {
          artifactId,
          include_unapproved: true // Allow downloading "Draft" PDFs even if not fully verified
        },
      });

      if (error) throw error;

      // Handle gate errors with specific messages
      if (data?.error) {
        if (data.error === "VERIFICATION GATE BLOCKED") {
          toast.error(`${data.unapproved_count} critical steps need approval first. Go to Review page.`, {
            duration: 6000,
          });
          return;
        }
        if (data.error === "EXECUTION IMPOSSIBLE UNTIL GOVERNANCE = TRUE") {
          toast.error("Reasoning entries pending your decision. Go to Review page.", {
            duration: 6000,
          });
          return;
        }
        throw new Error(data.message || data.error);
      }

      if (data?.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
        toast.success("PDF downloaded");
      }
    } catch (error) {
      console.error("Download PDF error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to download PDF");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading artifacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate("/transform")} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Transform
          </Button>

          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Artifact Origin Log</h1>
          </div>
          <p className="text-muted-foreground">
            Immutable record of all transformation artifacts and their verification history
          </p>
        </div>

        {/* Artifacts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Your Artifacts</CardTitle>
            <CardDescription>
              {artifacts?.length || 0} artifacts generated
            </CardDescription>
          </CardHeader>
          <CardContent>
            {artifacts && artifacts.length > 0 ? (
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Artifact ID</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Video Title</TableHead>
                      <TableHead>Frames</TableHead>
                      <TableHead>Critical</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {artifacts.map((artifact) => (
                      <Collapsible key={artifact.id} asChild>
                        <>
                          <TableRow className="cursor-pointer hover:bg-muted/50">
                            <TableCell>
                              <CollapsibleTrigger
                                onClick={() => setExpandedId(expandedId === artifact.id ? null : artifact.id)}
                              >
                                {expandedId === artifact.id ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </CollapsibleTrigger>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                  {artifact.id.slice(0, 8)}...
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(artifact.id);
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(artifact.created_at)}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {artifact.video_title}
                            </TableCell>
                            <TableCell>{artifact.frame_count}</TableCell>
                            <TableCell>
                              <Badge variant="destructive" className="text-xs">
                                {artifact.key_moments}
                              </Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(artifact)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/transform/${artifact.id}/review`);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadPDF(artifact.id);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          <CollapsibleContent asChild>
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30">
                                <div className="p-4 space-y-4">
                                  {/* Frame Stats */}
                                  {frameStats && expandedId === artifact.id && (
                                    <div className="grid grid-cols-5 gap-4">
                                      <div className="text-center p-2 bg-background rounded">
                                        <p className="text-lg font-bold">{frameStats.total}</p>
                                        <p className="text-xs text-muted-foreground">Total Frames</p>
                                      </div>
                                      <div className="text-center p-2 bg-background rounded">
                                        <p className="text-lg font-bold text-green-500">{frameStats.high}</p>
                                        <p className="text-xs text-muted-foreground">HIGH</p>
                                      </div>
                                      <div className="text-center p-2 bg-background rounded">
                                        <p className="text-lg font-bold text-amber-500">{frameStats.medium}</p>
                                        <p className="text-xs text-muted-foreground">MEDIUM</p>
                                      </div>
                                      <div className="text-center p-2 bg-background rounded">
                                        <p className="text-lg font-bold text-red-500">{frameStats.low}</p>
                                        <p className="text-xs text-muted-foreground">LOW</p>
                                      </div>
                                      <div className="text-center p-2 bg-background rounded">
                                        <p className="text-lg font-bold text-red-600">{frameStats.critical}</p>
                                        <p className="text-xs text-muted-foreground">CRITICAL</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Audit Trail */}
                                  <div>
                                    <h4 className="font-medium mb-2">Verification Audit Trail</h4>
                                    {approvals && approvals.length > 0 ? (
                                      <div className="space-y-2">
                                        {approvals.map((approval: any) => (
                                          <div
                                            key={approval.id}
                                            className="flex items-center gap-3 p-2 bg-background rounded text-sm"
                                          >
                                            {approval.action === "APPROVED" ? (
                                              <CheckCircle className="h-4 w-4 text-green-500" />
                                            ) : (
                                              <XCircle className="h-4 w-4 text-red-500" />
                                            )}
                                            <span className="font-medium">
                                              Frame #{approval.artifact_frames?.frame_index}
                                            </span>
                                            <span className="text-muted-foreground">
                                              "{approval.artifact_frames?.ocr_text?.slice(0, 30)}..."
                                            </span>
                                            <Badge
                                              variant={approval.action === "APPROVED" ? "default" : "destructive"}
                                              className="ml-auto"
                                            >
                                              {approval.action}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {formatDate(approval.created_at)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        No verification actions recorded yet
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No artifacts yet</h3>
                <p className="text-muted-foreground mb-4">
                  Transform your first video to create an artifact
                </p>
                <Button onClick={() => navigate("/transform")}>
                  Go to Transform
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
