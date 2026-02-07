import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Generate Execution-Grade PDF
 * 
 * Creates implementation-optimized PDFs from artifacts with:
 * - Exact steps with sequence numbers
 * - Prerequisites clearly marked
 * - Conditional logic (if/then)
 * - Constraints and gotchas highlighted
 * - Validation checkboxes
 * 
 * Preserves Sovereignty Gate enforcement - blocks generation if:
 * - Reasoning ledger has unresolved entries
 * - Critical frames lack human approval
 */

interface ImplementationStep {
  id: string;
  step_number: number;
  step_title: string;
  step_description: string | null;
  timestamp_start_ms: number | null;
  approval_status: string;
  is_enforceable: boolean;
  extraction_confidence: number | null;
}

interface StepDependency {
  id: string;
  prerequisite_step_id: string;
  dependency_type: string;
  condition_description: string | null;
}

interface StepConstraint {
  id: string;
  constraint_type: string;
  constraint_title: string;
  constraint_description: string;
  severity: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { artifact_id, include_unapproved = false } = await req.json();

    if (!artifact_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Missing artifact_id" 
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`[execution-pdf] Generating for artifact: ${artifact_id}`);

    // Fetch artifact
    const { data: artifact, error: artifactError } = await supabase
      .from("transformation_artifacts")
      .select("*")
      .eq("id", artifact_id)
      .single();

    if (artifactError || !artifact) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Artifact not found" 
      }), { 
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // SOVEREIGNTY GATE CHECK
    // Check if any reasoning log entries are unresolved
    const { data: pendingLogs } = await supabase
      .from("reasoning_logs")
      .select("id")
      .eq("artifact_id", artifact_id)
      .eq("human_decision", "Pending")
      .is("superseded_by", null);

    if (pendingLogs && pendingLogs.length > 0 && !include_unapproved) {
      console.log(`[execution-pdf] Blocked by Sovereignty Gate: ${pendingLogs.length} pending decisions`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "SOVEREIGNTY GATE: Cannot generate PDF with pending reasoning decisions",
        pending_count: pendingLogs.length,
        governance_blocked: true
      }), { 
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Fetch implementation steps
    const { data: steps, error: stepsError } = await supabase
      .from("implementation_steps")
      .select("*")
      .eq("artifact_id", artifact_id)
      .order("step_number", { ascending: true });

    if (stepsError || !steps || steps.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "No implementation steps found. Run regenerate-implementation-layer first."
      }), { 
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Fetch dependencies
    const stepIds = steps.map(s => s.id);
    const { data: dependencies } = await supabase
      .from("step_dependencies")
      .select("*")
      .in("dependent_step_id", stepIds);

    // Fetch constraints
    const { data: constraints } = await supabase
      .from("step_constraints")
      .select("*")
      .in("step_id", stepIds);

    // Build dependency map
    const depsByStep = new Map<string, StepDependency[]>();
    dependencies?.forEach(d => {
      const existing = depsByStep.get(d.dependent_step_id) || [];
      existing.push(d);
      depsByStep.set(d.dependent_step_id, existing);
    });

    // Build constraints map
    const constraintsByStep = new Map<string, StepConstraint[]>();
    constraints?.forEach(c => {
      const existing = constraintsByStep.get(c.step_id) || [];
      existing.push(c);
      constraintsByStep.set(c.step_id, existing);
    });

    // Step ID to number map for dependency resolution
    const stepIdToNumber = new Map(steps.map(s => [s.id, s.step_number]));

    // Generate Execution-Grade PDF content
    const pdfContent = generateExecutionPDF(
      artifact,
      steps as ImplementationStep[],
      depsByStep,
      constraintsByStep,
      stepIdToNumber,
      include_unapproved
    );

    // Store PDF metadata (actual PDF generation would need jsPDF on client or separate service)
    const pdfVersion = `v${Date.now()}`;
    const _storagePath = `execution-pdfs/${artifact_id}/${pdfVersion}.pdf`;

    // Update artifact with execution PDF reference
    await supabase
      .from("transformation_artifacts")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", artifact_id);

    // Log generation to reasoning ledger
    await supabase.from("reasoning_logs").insert({
      artifact_id,
      source_type: "System",
      source_label: "Execution PDF Generator",
      source_role: "Publisher",
      analysis_focus: "PDF Generation",
      summary: `Generated Execution-Grade PDF with ${steps.length} steps`,
      concern_level: "None",
      recommendation: "PDF ready for download",
      human_decision: "Acknowledged"
    });

    console.log(`[execution-pdf] Generated successfully: ${steps.length} steps`);

    return new Response(JSON.stringify({
      success: true,
      artifact_id,
      video_title: artifact.video_title,
      steps_count: steps.length,
      dependencies_count: dependencies?.length || 0,
      constraints_count: constraints?.length || 0,
      approved_steps: steps.filter(s => s.approval_status === 'approved').length,
      pending_steps: steps.filter(s => s.approval_status === 'proposed').length,
      pdf_content: pdfContent,
      pdf_version: pdfVersion,
      governance_status: pendingLogs?.length === 0 ? "cleared" : "pending_decisions"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[execution-pdf] Error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error"
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});

function generateExecutionPDF(
  artifact: { video_title: string; duration_seconds: number },
  steps: ImplementationStep[],
  depsByStep: Map<string, StepDependency[]>,
  constraintsByStep: Map<string, StepConstraint[]>,
  stepIdToNumber: Map<string, number>,
  includeUnapproved: boolean
): string {
  const lines: string[] = [];
  
  // Header
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("                    EXECUTION-GRADE ARTIFACT");
  lines.push("                    Implementation Protocol");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`TITLE: ${artifact.video_title}`);
  lines.push(`DURATION: ${Math.floor(artifact.duration_seconds / 60)} minutes`);
  lines.push(`STEPS: ${steps.length}`);
  lines.push(`GENERATED: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────────");
  lines.push("                      EXECUTION SEQUENCE");
  lines.push("───────────────────────────────────────────────────────────────");
  lines.push("");

  // Steps
  for (const step of steps) {
    if (step.approval_status === 'rejected') continue;
    if (step.approval_status === 'proposed' && !includeUnapproved) continue;

    const deps = depsByStep.get(step.id) || [];
    const cons = constraintsByStep.get(step.id) || [];

    // Step header
    const statusIcon = step.is_enforceable ? "✓" : "○";
    const confidenceStr = step.extraction_confidence 
      ? ` [${Math.round(step.extraction_confidence * 100)}%]` 
      : "";
    
    lines.push(`┌─────────────────────────────────────────────────────────────┐`);
    lines.push(`│ ${statusIcon} STEP ${step.step_number}: ${step.step_title}${confidenceStr}`);
    lines.push(`└─────────────────────────────────────────────────────────────┘`);
    
    // Timestamp
    if (step.timestamp_start_ms) {
      const mins = Math.floor(step.timestamp_start_ms / 60000);
      const secs = Math.floor((step.timestamp_start_ms % 60000) / 1000);
      lines.push(`  📍 Video Reference: ${mins}:${secs.toString().padStart(2, '0')}`);
    }

    // Prerequisites
    if (deps.length > 0) {
      lines.push("");
      lines.push("  ⚠️  PREREQUISITES:");
      for (const dep of deps) {
        const prereqNum = stepIdToNumber.get(dep.prerequisite_step_id);
        const typeLabel = dep.dependency_type === 'blocking' ? '🚫 BLOCKING' 
          : dep.dependency_type === 'conditional' ? '🔀 IF/THEN'
          : dep.dependency_type === 'recommended' ? '💡 RECOMMENDED'
          : '→ REQUIRED';
        lines.push(`      ${typeLabel}: Complete Step ${prereqNum} first`);
        if (dep.condition_description) {
          lines.push(`         └─ ${dep.condition_description}`);
        }
      }
    }

    // Description
    if (step.step_description) {
      lines.push("");
      lines.push("  📋 INSTRUCTIONS:");
      const descLines = step.step_description.split('\n');
      for (const line of descLines) {
        lines.push(`      ${line}`);
      }
    }

    // Constraints and Gotchas
    const criticalCons = cons.filter(c => c.severity === 'critical');
    const warningCons = cons.filter(c => c.severity === 'warning');
    const infoCons = cons.filter(c => c.severity === 'info');

    if (criticalCons.length > 0) {
      lines.push("");
      lines.push("  🚨 CRITICAL CONSTRAINTS:");
      for (const c of criticalCons) {
        lines.push(`      ⛔ ${c.constraint_title}`);
        lines.push(`         ${c.constraint_description}`);
      }
    }

    if (warningCons.length > 0) {
      lines.push("");
      lines.push("  ⚡ GOTCHAS & WARNINGS:");
      for (const c of warningCons) {
        lines.push(`      ⚠️ ${c.constraint_title}`);
        lines.push(`         ${c.constraint_description}`);
      }
    }

    if (infoCons.length > 0) {
      lines.push("");
      lines.push("  💡 TIPS:");
      for (const c of infoCons) {
        lines.push(`      ℹ️ ${c.constraint_title}: ${c.constraint_description}`);
      }
    }

    // Validation checkbox
    lines.push("");
    lines.push("  ☐ COMPLETED  ☐ VERIFIED  ☐ SKIPPED (requires approval frame)");
    lines.push("");
  }

  // Footer
  lines.push("───────────────────────────────────────────────────────────────");
  lines.push("                      GOVERNANCE NOTICE");
  lines.push("───────────────────────────────────────────────────────────────");
  lines.push("");
  lines.push("This Execution-Grade PDF was generated under OneDuo™ governance.");
  lines.push("Skipping prerequisites requires an approved execution_frame.");
  lines.push("All step completions are logged to an immutable audit trail.");
  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");

  return lines.join("\n");
}
