import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, CheckCircle, XCircle, Edit, AlertTriangle, Info, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReasoningLog {
  id: string;
  artifact_id: string;
  source_type: "AI" | "Human" | "System";
  source_label: string;
  source_role: string | null;
  analysis_focus: string;
  summary: string;
  concern_level: string;
  recommendation: string | null;
  human_decision: string;
  decision_notes: string | null;
  superseded_by: string | null;
  created_at: string;
}

interface ReasoningLogPanelProps {
  artifactId: string;
  onPendingChange?: (hasPending: boolean) => void;
}

const FOCUS_OPTIONS = ["Visual", "Logical", "Risk", "Process", "Performance", "Other"];
const CONCERN_OPTIONS = ["None", "Low", "Medium", "High", "Critical"];
const DECISION_OPTIONS = ["Pending", "Accepted", "Modified", "Rejected"];

// Trinity Roles for multi-perspective governance
const ROLE_OPTIONS = [
  { value: "", label: "None", description: "" },
  { value: "ROLE_GOVERNOR", label: "Governor", description: "Checks for risks, blind spots, unintended consequences" },
  { value: "ROLE_ENGINEER", label: "Engineer", description: "Evaluates logic, edge cases, failure points" },
  { value: "ROLE_ARCHITECT", label: "Architect", description: "Assesses structure, dependencies, scalability" },
];

const roleColors: Record<string, string> = {
  ROLE_GOVERNOR: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  ROLE_ENGINEER: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  ROLE_ARCHITECT: "bg-purple-500/20 text-purple-400 border-purple-500/40",
};

const concernColors: Record<string, string> = {
  None: "bg-muted text-muted-foreground",
  Low: "bg-blue-500/20 text-blue-400",
  Medium: "bg-yellow-500/20 text-yellow-400",
  High: "bg-orange-500/20 text-orange-400",
  Critical: "bg-destructive/20 text-destructive",
};

const decisionColors: Record<string, string> = {
  Pending: "bg-muted text-muted-foreground",
  Accepted: "bg-green-500/20 text-green-400",
  Modified: "bg-blue-500/20 text-blue-400",
  Rejected: "bg-destructive/20 text-destructive",
};

export function ReasoningLogPanel({ artifactId, onPendingChange }: ReasoningLogPanelProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDecision, setEditingDecision] = useState<string | null>(null);
  
  // Form state for new entry
  const [newEntry, setNewEntry] = useState<{
    source_type: "AI" | "Human" | "System";
    source_label: string;
    source_role: string;
    analysis_focus: string;
    summary: string;
    concern_level: string;
    recommendation: string;
  }>({
    source_type: "AI" as const,
    source_label: "",
    source_role: "",
    analysis_focus: "Logical",
    summary: "",
    concern_level: "None",
    recommendation: "",
  });
  
  // Decision form state
  const [decisionForm, setDecisionForm] = useState({
    human_decision: "Accepted",
    decision_notes: "",
  });

  // Fetch reasoning logs
  const { data: logs, isLoading } = useQuery({
    queryKey: ["reasoning-logs", artifactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reasoning_logs")
        .select("*")
        .eq("artifact_id", artifactId)
        .is("superseded_by", null)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // Notify parent about pending entries
      const hasPending = data?.some(log => log.human_decision === "Pending") ?? false;
      onPendingChange?.(hasPending);
      
      return data as ReasoningLog[];
    },
  });

  // Add new reasoning entry
  const addMutation = useMutation({
    mutationFn: async (entry: typeof newEntry) => {
      const { error } = await supabase.from("reasoning_logs").insert({
        artifact_id: artifactId,
        source_type: entry.source_type,
        source_label: entry.source_label,
        source_role: entry.source_role || null,
        analysis_focus: entry.analysis_focus,
        summary: entry.summary,
        concern_level: entry.concern_level,
        recommendation: entry.recommendation || null,
        human_decision: "Pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reasoning-logs", artifactId] });
      toast.success("Reasoning entry added");
      setShowAddForm(false);
      setNewEntry({
        source_type: "AI",
        source_label: "",
        source_role: "",
        analysis_focus: "Logical",
        summary: "",
        concern_level: "None",
        recommendation: "",
      });
    },
    onError: (error) => {
      toast.error("Failed to add entry: " + error.message);
    },
  });

  // Lock decision on entry
  const lockDecisionMutation = useMutation({
    mutationFn: async ({ logId, decision, notes }: { logId: string; decision: string; notes: string }) => {
      const { error } = await supabase
        .from("reasoning_logs")
        .update({
          human_decision: decision,
          decision_notes: notes || null,
        })
        .eq("id", logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reasoning-logs", artifactId] });
      toast.success("Decision locked");
      setEditingDecision(null);
    },
    onError: (error) => {
      toast.error("Failed to lock decision: " + error.message);
    },
  });

  const pendingCount = logs?.filter(l => l.human_decision === "Pending").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Reasoning & Decision Log</h3>
          {pendingCount > 0 && (
            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40">
              {pendingCount} Pending
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
          variant={showAddForm ? "outline" : "default"}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Entry
        </Button>
      </div>

      {/* Add Entry Form */}
      {showAddForm && (
        <Card className="border-primary/30 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">New Reasoning Entry</CardTitle>
            <p className="text-xs text-muted-foreground">
              Use neutral descriptors. Avoid vendor names.
              Examples: "LLM Session A", "Risk Review", "System Analysis 1"
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Source Type</Label>
                <Select
                  value={newEntry.source_type}
                  onValueChange={(v) => setNewEntry({ ...newEntry, source_type: v as "AI" | "Human" | "System" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AI">AI</SelectItem>
                    <SelectItem value="Human">Human</SelectItem>
                    <SelectItem value="System">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trinity Role</Label>
                <Select
                  value={newEntry.source_role}
                  onValueChange={(v) => setNewEntry({ ...newEntry, source_role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(role => (
                      <SelectItem key={role.value} value={role.value || "none"}>
                        <span>{role.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newEntry.source_role && (
                  <p className="text-xs text-muted-foreground">
                    {ROLE_OPTIONS.find(r => r.value === newEntry.source_role)?.description}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Source Label</Label>
                <Input
                  placeholder="e.g., LLM Session A"
                  value={newEntry.source_label}
                  onChange={(e) => setNewEntry({ ...newEntry, source_label: e.target.value })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Analysis Focus</Label>
                <Select
                  value={newEntry.analysis_focus}
                  onValueChange={(v) => setNewEntry({ ...newEntry, analysis_focus: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOCUS_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Concern Level</Label>
                <Select
                  value={newEntry.concern_level}
                  onValueChange={(v) => setNewEntry({ ...newEntry, concern_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONCERN_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Summary</Label>
              <Textarea
                placeholder="What was observed or analyzed..."
                value={newEntry.summary}
                onChange={(e) => setNewEntry({ ...newEntry, summary: e.target.value })}
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Recommendation (optional)</Label>
              <Textarea
                placeholder="Suggested action..."
                value={newEntry.recommendation}
                onChange={(e) => setNewEntry({ ...newEntry, recommendation: e.target.value })}
                rows={2}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addMutation.mutate(newEntry)}
                disabled={!newEntry.source_label || !newEntry.summary || addMutation.isPending}
              >
                {addMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : null}
                Add Entry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Entries */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3 pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs?.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="py-8 text-center">
                <Info className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">No reasoning entries recorded yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add observations from AI sessions or human reviews.
                </p>
              </CardContent>
            </Card>
          ) : (
            logs?.map((log) => (
              <Card key={log.id} className="bg-card/50">
                <CardContent className="p-4">
                  {/* Entry header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{log.source_type}</Badge>
                      {log.source_role && (
                        <Badge className={roleColors[log.source_role] || "bg-muted"}>
                          {log.source_role === "ROLE_GOVERNOR" && "Governor"}
                          {log.source_role === "ROLE_ENGINEER" && "Engineer"}
                          {log.source_role === "ROLE_ARCHITECT" && "Architect"}
                        </Badge>
                      )}
                      <span className="text-sm font-medium">{log.source_label}</span>
                      <Badge className={concernColors[log.concern_level]}>
                        {log.concern_level}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  
                  {/* Focus and Summary */}
                  <div className="space-y-2 mb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Focus: {log.analysis_focus}
                    </p>
                    <p className="text-sm">{log.summary}</p>
                    {log.recommendation && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Recommendation:</span> {log.recommendation}
                      </p>
                    )}
                  </div>
                  
                  {/* Decision section */}
                  <div className="border-t border-border pt-3 mt-3">
                    {editingDecision === log.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Human Decision</Label>
                            <Select
                              value={decisionForm.human_decision}
                              onValueChange={(v) => setDecisionForm({ ...decisionForm, human_decision: v })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DECISION_OPTIONS.filter(d => d !== "Pending").map(opt => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Decision Notes</Label>
                          <Textarea
                            placeholder="Why this decision was made..."
                            value={decisionForm.decision_notes}
                            onChange={(e) => setDecisionForm({ ...decisionForm, decision_notes: e.target.value })}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingDecision(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => lockDecisionMutation.mutate({
                              logId: log.id,
                              decision: decisionForm.human_decision,
                              notes: decisionForm.decision_notes,
                            })}
                            disabled={lockDecisionMutation.isPending}
                          >
                            {lockDecisionMutation.isPending ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3 mr-1" />
                            )}
                            Lock Decision
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground uppercase">Decision:</span>
                          <Badge className={decisionColors[log.human_decision]}>
                            {log.human_decision === "Pending" && <AlertTriangle className="w-3 h-3 mr-1" />}
                            {log.human_decision === "Accepted" && <CheckCircle className="w-3 h-3 mr-1" />}
                            {log.human_decision === "Rejected" && <XCircle className="w-3 h-3 mr-1" />}
                            {log.human_decision === "Modified" && <Edit className="w-3 h-3 mr-1" />}
                            {log.human_decision}
                          </Badge>
                          {log.decision_notes && (
                            <span className="text-xs text-muted-foreground ml-2">
                              — {log.decision_notes}
                            </span>
                          )}
                        </div>
                        {log.human_decision === "Pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingDecision(log.id);
                              setDecisionForm({ human_decision: "Accepted", decision_notes: "" });
                            }}
                          >
                            Lock Decision
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
