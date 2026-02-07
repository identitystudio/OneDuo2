import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  ArrowRight,
  Zap,
  Shield,
  ListChecks,
} from "lucide-react";

interface ImplementationStep {
  id: string;
  artifact_id: string;
  step_number: number;
  step_title: string;
  step_description: string | null;
  timestamp_start_ms: number | null;
  timestamp_end_ms: number | null;
  extraction_confidence: number | null;
  approval_status: "proposed" | "approved" | "rejected" | "superseded";
  is_enforceable: boolean;
  created_at: string;
}

interface StepDependency {
  id: string;
  dependent_step_id: string;
  prerequisite_step_id: string;
  dependency_type: "prerequisite" | "conditional" | "blocking" | "recommended";
  condition_description: string | null;
  approval_status: string;
}

interface StepConstraint {
  id: string;
  step_id: string;
  constraint_type: string;
  constraint_title: string;
  constraint_description: string;
  severity: "info" | "warning" | "critical";
  approval_status: string;
}

interface StepCompletion {
  id: string;
  step_id: string;
  status: "incomplete" | "in_progress" | "completed" | "skipped";
  completed_at: string | null;
  skipped_prerequisites: boolean;
}

interface ImplementationStepsProps {
  artifactId: string;
  onStepSelect?: (step: ImplementationStep) => void;
}

export function ImplementationSteps({ artifactId, onStepSelect }: ImplementationStepsProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch steps
  const { data: steps, isLoading: stepsLoading } = useQuery({
    queryKey: ["implementation-steps", artifactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("implementation_steps")
        .select("*")
        .eq("artifact_id", artifactId)
        .order("step_number", { ascending: true });
      if (error) throw error;
      return data as ImplementationStep[];
    },
  });

  // Fetch dependencies
  const { data: dependencies } = useQuery({
    queryKey: ["step-dependencies", artifactId],
    queryFn: async () => {
      if (!steps?.length) return [];
      const stepIds = steps.map(s => s.id);
      const { data, error } = await supabase
        .from("step_dependencies")
        .select("*")
        .in("dependent_step_id", stepIds);
      if (error) throw error;
      return data as StepDependency[];
    },
    enabled: !!steps?.length,
  });

  // Fetch constraints
  const { data: constraints } = useQuery({
    queryKey: ["step-constraints", artifactId],
    queryFn: async () => {
      if (!steps?.length) return [];
      const stepIds = steps.map(s => s.id);
      const { data, error } = await supabase
        .from("step_constraints")
        .select("*")
        .in("step_id", stepIds);
      if (error) throw error;
      return data as StepConstraint[];
    },
    enabled: !!steps?.length,
  });

  // Fetch user completions
  const { data: completions } = useQuery({
    queryKey: ["step-completions", artifactId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !steps?.length) return [];
      const stepIds = steps.map(s => s.id);
      const { data, error } = await supabase
        .from("step_completions")
        .select("*")
        .in("step_id", stepIds)
        .eq("user_id", user.id);
      if (error) throw error;
      return data as StepCompletion[];
    },
    enabled: !!steps?.length,
  });

  // Approve step mutation
  const approveMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("implementation_steps")
        .update({
          approval_status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["implementation-steps", artifactId] });
      toast.success("Step approved and now enforceable");
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  // Reject step mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ stepId, reason }: { stepId: string; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("implementation_steps")
        .update({
          approval_status: "rejected",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["implementation-steps", artifactId] });
      toast.success("Step rejected");
    },
  });

  // Complete step mutation
  const completeMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Use the governance-gated RPC function
      const { data, error } = await supabase.rpc("complete_implementation_step", {
        p_step_id: stepId,
        p_user_id: user.id,
      });

      if (error) throw error;
      if (data && data[0] && !data[0].success) {
        throw new Error(data[0].error_message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["step-completions", artifactId] });
      toast.success("Step completed!");
    },
    onError: (error) => {
      if (error.message.includes("GOVERNANCE REQUIRED")) {
        toast.error("Prerequisites not met. Request approval to skip.", { duration: 5000 });
      } else {
        toast.error(error.message);
      }
    },
  });

  const toggleExpand = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const formatTimestamp = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getStepDependencies = (stepId: string) => 
    dependencies?.filter(d => d.dependent_step_id === stepId) || [];

  const getStepConstraints = (stepId: string) =>
    constraints?.filter(c => c.step_id === stepId) || [];

  const getStepCompletion = (stepId: string) =>
    completions?.find(c => c.step_id === stepId);

  const getPrerequisiteStep = (prereqId: string) =>
    steps?.find(s => s.id === prereqId);

  if (stepsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 animate-spin" />
            Loading implementation steps...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!steps?.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <ListChecks className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No implementation steps extracted yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Process the artifact to extract steps.
          </p>
        </CardContent>
      </Card>
    );
  }

  const proposedCount = steps.filter(s => s.approval_status === "proposed").length;
  const approvedCount = steps.filter(s => s.approval_status === "approved").length;
  const completedCount = completions?.filter(c => c.status === "completed").length || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Implementation Steps
          </div>
          <div className="flex items-center gap-2 text-sm font-normal">
            {proposedCount > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                {proposedCount} pending
              </Badge>
            )}
            <Badge variant="secondary">
              {completedCount}/{approvedCount} done
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <Separator />
      
      <ScrollArea className="h-[500px]">
        <div className="p-4 space-y-3">
          {steps.map((step, index) => {
            const stepDeps = getStepDependencies(step.id);
            const stepConstraints = getStepConstraints(step.id);
            const completion = getStepCompletion(step.id);
            const isExpanded = expandedSteps.has(step.id);
            const isCompleted = completion?.status === "completed";
            const isPending = step.approval_status === "proposed";
            const isRejected = step.approval_status === "rejected";
            const canComplete = step.is_enforceable && !isCompleted;

            return (
              <div key={step.id} className="relative">
                {/* Connection line */}
                {index > 0 && (
                  <div className="absolute -top-3 left-6 h-3 w-0.5 bg-border" />
                )}
                
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(step.id)}>
                  <div
                    className={`border rounded-lg p-3 transition-colors ${
                      isCompleted
                        ? "bg-green-500/5 border-green-500/30"
                        : isPending
                        ? "bg-amber-500/5 border-amber-500/30"
                        : isRejected
                        ? "bg-destructive/5 border-destructive/30 opacity-50"
                        : "bg-card"
                    }`}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-start gap-3">
                        {/* Step number indicator */}
                        <div
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            isCompleted
                              ? "bg-green-500 text-white"
                              : isPending
                              ? "bg-amber-500 text-white"
                              : isRejected
                              ? "bg-destructive text-white"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            step.step_number
                          )}
                        </div>

                        {/* Step content */}
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{step.step_title}</span>
                            {step.is_enforceable ? (
                              <Lock className="h-3 w-3 text-green-500" />
                            ) : (
                              <Unlock className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {step.timestamp_start_ms && (
                              <span>{formatTimestamp(step.timestamp_start_ms)}</span>
                            )}
                            {step.extraction_confidence && (
                              <Badge variant="outline" className="text-[10px] h-4">
                                {Math.round(step.extraction_confidence * 100)}% conf
                              </Badge>
                            )}
                            {stepDeps.length > 0 && (
                              <Badge variant="outline" className="text-[10px] h-4">
                                {stepDeps.length} deps
                              </Badge>
                            )}
                            {stepConstraints.filter(c => c.severity === "critical").length > 0 && (
                              <Badge variant="destructive" className="text-[10px] h-4">
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                gotcha
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Expand indicator */}
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="mt-3 pt-3 border-t space-y-3">
                        {/* Description */}
                        {step.step_description && (
                          <p className="text-sm text-muted-foreground">
                            {step.step_description}
                          </p>
                        )}

                        {/* Dependencies */}
                        {stepDeps.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Prerequisites:
                            </p>
                            {stepDeps.map(dep => {
                              const prereq = getPrerequisiteStep(dep.prerequisite_step_id);
                              const prereqCompletion = prereq ? getStepCompletion(prereq.id) : null;
                              const isPrereqDone = prereqCompletion?.status === "completed";
                              
                              return (
                                <div key={dep.id} className="flex items-center gap-2 text-xs">
                                  <ArrowRight className="h-3 w-3" />
                                  <span className={isPrereqDone ? "line-through text-muted-foreground" : ""}>
                                    Step {prereq?.step_number}: {prereq?.step_title}
                                  </span>
                                  <Badge variant="outline" className="text-[10px] h-4">
                                    {dep.dependency_type}
                                  </Badge>
                                  {isPrereqDone && <CheckCircle className="h-3 w-3 text-green-500" />}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Constraints */}
                        {stepConstraints.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Constraints & Gotchas:
                            </p>
                            {stepConstraints.map(constraint => (
                              <div
                                key={constraint.id}
                                className={`flex items-start gap-2 text-xs p-2 rounded ${
                                  constraint.severity === "critical"
                                    ? "bg-destructive/10"
                                    : constraint.severity === "warning"
                                    ? "bg-amber-500/10"
                                    : "bg-muted/50"
                                }`}
                              >
                                {constraint.severity === "critical" ? (
                                  <AlertTriangle className="h-3 w-3 text-destructive mt-0.5" />
                                ) : constraint.severity === "warning" ? (
                                  <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5" />
                                ) : (
                                  <Zap className="h-3 w-3 text-muted-foreground mt-0.5" />
                                )}
                                <div>
                                  <span className="font-medium">{constraint.constraint_title}</span>
                                  <p className="text-muted-foreground mt-0.5">
                                    {constraint.constraint_description}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                          {isPending && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-600 hover:bg-green-600 hover:text-white"
                                onClick={() => approveMutation.mutate(step.id)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive hover:bg-destructive hover:text-white"
                                onClick={() => rejectMutation.mutate({ stepId: step.id, reason: "Not accurate" })}
                                disabled={rejectMutation.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          
                          {canComplete && (
                            <Button
                              size="sm"
                              onClick={() => completeMutation.mutate(step.id)}
                              disabled={completeMutation.isPending}
                            >
                              <Shield className="h-3 w-3 mr-1" />
                              Mark Complete
                            </Button>
                          )}
                          
                          {onStepSelect && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onStepSelect(step)}
                            >
                              View in Video
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
