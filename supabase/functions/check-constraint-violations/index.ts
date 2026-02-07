import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Check Constraint Violations
 * 
 * Pre-execution validation before any critical operation.
 * Part of the OneDuo Governance Layer.
 * 
 * This function checks if a proposed operation would violate any constraints,
 * and logs violations to the constraint_violations table.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { entity_type, entity_id, proposed_operation } = await req.json();

    if (!entity_type || !entity_id || !proposed_operation) {
      return new Response(JSON.stringify({ 
        valid: false, 
        violations: [{ constraint: 'missing_parameters', severity: 'critical' }] 
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`[check-constraint-violations] Checking ${entity_type}:${entity_id} for operation: ${proposed_operation.operation}`);

    const violations: Array<{
      constraint: string;
      type: string;
      severity: string;
      expected: Record<string, unknown>;
      actual: Record<string, unknown>;
    }> = [];

    // Get current entity state
    const tableName = entity_type === 'course' ? 'courses' : 'processing_queue';
    const { data: entity, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", entity_id)
      .single();

    if (fetchError || !entity) {
      console.log(`[check-constraint-violations] Entity not found: ${entity_id}`);
      return new Response(JSON.stringify({ 
        valid: false, 
        violations: [{ 
          constraint: 'entity_not_found', 
          type: 'data_integrity',
          severity: 'critical',
          expected: { exists: true },
          actual: { exists: false }
        }] 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============ CONSTRAINT: Marking as failed when data exists ============
    if (proposed_operation.operation === 'mark_failed' && entity_type === 'course') {
      const hasFrames = entity.frame_urls && 
                        Array.isArray(entity.frame_urls) && 
                        entity.frame_urls.length > 0;
      const hasTranscript = entity.transcript && 
                            entity.transcript !== '{}' && 
                            entity.transcript !== null;
      
      if (hasFrames && hasTranscript) {
        violations.push({
          constraint: 'false_failure_with_complete_data',
          type: 'race_condition',
          severity: 'critical',
          expected: { status: 'processing', reason: 'data_exists' },
          actual: { 
            status: 'failed', 
            frame_count: entity.frame_urls.length,
            has_transcript: true,
            current_status: entity.status,
            error_message: proposed_operation.error_message || entity.error_message
          }
        });
        console.log(`[check-constraint-violations] CRITICAL: Blocking false failure - ${entity.frame_urls.length} frames and transcript exist`);
      }
    }

    // ============ CONSTRAINT: Course with governance_locked cannot be modified ============
    if (entity_type === 'course' && entity.governance_locked === true) {
      violations.push({
        constraint: 'governance_locked',
        type: 'business_logic',
        severity: 'critical',
        expected: { governance_locked: false },
        actual: { governance_locked: true }
      });
      console.log(`[check-constraint-violations] CRITICAL: Course is governance-locked`);
    }

    // ============ CONSTRAINT: Processing queue requires approval frame ============
    if (entity_type === 'processing_queue' && 
        proposed_operation.operation === 'claim_job' && 
        entity.requires_approval === true && 
        !entity.approval_frame_id) {
      violations.push({
        constraint: 'missing_approval_frame',
        type: 'business_logic',
        severity: 'critical',
        expected: { approval_frame_id: 'not_null' },
        actual: { approval_frame_id: null, requires_approval: true }
      });
      console.log(`[check-constraint-violations] CRITICAL: Job requires approval frame`);
    }

    // ============ CONSTRAINT: Course constraint_status is violated ============
    if (entity_type === 'course' && entity.constraint_status === 'violated') {
      violations.push({
        constraint: 'prior_violation_unresolved',
        type: 'data_integrity',
        severity: 'error',
        expected: { constraint_status: 'valid' },
        actual: { constraint_status: 'violated' }
      });
      console.log(`[check-constraint-violations] ERROR: Course has unresolved constraint violation`);
    }

    // Log violations to database
    for (const violation of violations) {
      await supabase.from("constraint_violations").insert({
        entity_type,
        entity_id,
        constraint_name: violation.constraint,
        violation_type: violation.type,
        expected_state: violation.expected,
        actual_state: violation.actual,
        severity: violation.severity
      });
    }

    // Update course constraint status if there are violations
    if (violations.length > 0 && entity_type === 'course') {
      await supabase.from("courses").update({
        constraint_status: 'violated',
        last_constraint_check: new Date().toISOString()
      }).eq("id", entity_id);
    } else if (entity_type === 'course') {
      await supabase.from("courses").update({
        constraint_status: 'valid',
        last_constraint_check: new Date().toISOString()
      }).eq("id", entity_id);
    }

    const isValid = violations.filter(v => v.severity === 'critical').length === 0;

    console.log(`[check-constraint-violations] Result: valid=${isValid}, violations=${violations.length}`);

    return new Response(JSON.stringify({
      valid: isValid,
      violations,
      checked_at: new Date().toISOString()
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[check-constraint-violations] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      valid: false, 
      error: errorMessage,
      violations: [{ constraint: 'internal_error', severity: 'critical' }] 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
