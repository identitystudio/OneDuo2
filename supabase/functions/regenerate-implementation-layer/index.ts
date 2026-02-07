import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Regenerate Implementation Layer
 * 
 * Batch processor that applies the Implementation Layer to existing artifacts.
 * Does NOT re-ingest videos - only re-analyzes existing frames.
 * 
 * Preserves:
 * - Execution frame governance
 * - Sovereignty gates
 * - Reasoning ledger immutability
 */

interface RegenerationResult {
  artifact_id: string;
  video_title: string;
  steps_extracted: number;
  dependencies_created: number;
  constraints_created: number;
  success: boolean;
  error?: string;
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

    const { action, artifact_id, batch_size = 10 } = await req.json();

    // Action: list - Show artifacts that need regeneration
    if (action === "list") {
      const { data: artifacts, error } = await supabase
        .from("transformation_artifacts")
        .select(`
          id, 
          video_title, 
          status, 
          frame_count, 
          duration_seconds,
          created_at
        `)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Check which already have implementation steps
      const { data: existingSteps } = await supabase
        .from("implementation_steps")
        .select("artifact_id")
        .in("artifact_id", artifacts?.map(a => a.id) || []);

      const artifactsWithSteps = new Set(existingSteps?.map(s => s.artifact_id) || []);

      return new Response(JSON.stringify({
        success: true,
        total_artifacts: artifacts?.length || 0,
        already_processed: artifactsWithSteps.size,
        pending: (artifacts?.length || 0) - artifactsWithSteps.size,
        artifacts: artifacts?.map(a => ({
          ...a,
          has_implementation_steps: artifactsWithSteps.has(a.id)
        }))
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Action: regenerate_single - Process one artifact
    if (action === "regenerate_single" && artifact_id) {
      console.log(`[regenerate] Processing single artifact: ${artifact_id}`);
      
      const result = await processArtifact(supabase, artifact_id);
      
      return new Response(JSON.stringify({
        success: result.success,
        result
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Action: regenerate_batch - Process multiple artifacts
    if (action === "regenerate_batch") {
      console.log(`[regenerate] Starting batch regeneration (batch_size: ${batch_size})`);

      // Find artifacts without implementation steps
      const { data: allArtifacts } = await supabase
        .from("transformation_artifacts")
        .select("id")
        .eq("status", "completed");

      const { data: existingSteps } = await supabase
        .from("implementation_steps")
        .select("artifact_id");

      const processedIds = new Set(existingSteps?.map(s => s.artifact_id) || []);
      const pendingArtifacts = allArtifacts?.filter(a => !processedIds.has(a.id)) || [];

      // Process batch
      const batchToProcess = pendingArtifacts.slice(0, batch_size);
      const results: RegenerationResult[] = [];

      for (const artifact of batchToProcess) {
        try {
          const result = await processArtifact(supabase, artifact.id);
          results.push(result);
        } catch (error) {
          results.push({
            artifact_id: artifact.id,
            video_title: 'Unknown',
            steps_extracted: 0,
            dependencies_created: 0,
            constraints_created: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      return new Response(JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: results.length - successCount,
        remaining: pendingArtifacts.length - results.length,
        results
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: false,
      error: "Invalid action. Use: list, regenerate_single, or regenerate_batch"
    }), { 
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    console.error("[regenerate] Error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error"
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});

// deno-lint-ignore no-explicit-any
async function processArtifact(
  supabase: any,
  artifactId: string
): Promise<RegenerationResult> {
  // Fetch artifact
  const { data: artifact, error: artifactError } = await supabase
    .from("transformation_artifacts")
    .select("*")
    .eq("id", artifactId)
    .single();

  if (artifactError || !artifact) {
    throw new Error(`Artifact not found: ${artifactId}`);
  }

  console.log(`[regenerate] Processing: ${artifact.video_title}`);

  // Clear any existing implementation data for this artifact (idempotent regeneration)
  await supabase
    .from("implementation_steps")
    .delete()
    .eq("artifact_id", artifactId);

  // Call the extract-implementation-steps function
  const { data: extractResult, error: extractError } = await supabase.functions.invoke(
    "extract-implementation-steps",
    { body: { artifact_id: artifactId } }
  );

  if (extractError) {
    throw new Error(`Extraction failed: ${extractError.message}`);
  }

  if (!extractResult?.success) {
    throw new Error(extractResult?.error || "Extraction returned unsuccessful");
  }

  // Count created entities
  const { count: stepsCount } = await supabase
    .from("implementation_steps")
    .select("*", { count: "exact", head: true })
    .eq("artifact_id", artifactId);

  // Get step IDs for dependency/constraint counting
  const { data: stepsData } = await supabase
    .from("implementation_steps")
    .select("id")
    .eq("artifact_id", artifactId);
  
  const stepIdList = stepsData?.map((s: { id: string }) => s.id) || [];

  const { count: depsCount } = await supabase
    .from("step_dependencies")
    .select("*", { count: "exact", head: true })
    .in("dependent_step_id", stepIdList);

  const { count: constraintsCount } = await supabase
    .from("step_constraints")
    .select("*", { count: "exact", head: true })
    .in("step_id", stepIdList);

  // Log to reasoning ledger (immutable audit)
  await supabase.from("reasoning_logs").insert({
    artifact_id: artifactId,
    source_type: "System",
    source_label: "Implementation Layer Regeneration",
    source_role: "Analyst",
    analysis_focus: "Batch Processing",
    summary: `Regenerated implementation layer: ${stepsCount} steps, ${depsCount} dependencies, ${constraintsCount} constraints`,
    concern_level: "None",
    recommendation: "Review extracted steps and approve for enforcement",
    human_decision: "Pending"
  });

  return {
    artifact_id: artifactId,
    video_title: String(artifact.video_title || "Untitled"),
    steps_extracted: stepsCount || 0,
    dependencies_created: depsCount || 0,
    constraints_created: constraintsCount || 0,
    success: true
  };
}
