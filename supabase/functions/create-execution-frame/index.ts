import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Create Execution Frame
 *
 * Generate frames for operations, check approval gates, auto-approve when conditions met.
 * Part of the OneDuo Governance Layer.
 *
 * Every state transition requires a frame. No action without identity.
 * When human approval is required, the response includes an approval_token —
 * the HMAC-SHA256 of canonical(proposed_state):frame_id. The approver must pass
 * this token as approval_signature to approve-execution-frame. This cryptographically
 * binds the approval to the exact payload created here.
 */

// Canonicalize an object by sorting all keys recursively
function canonicalize(obj: unknown): string {
  const allKeys: string[] = [];
  JSON.stringify(obj, (key, value) => {
    allKeys.push(key);
    return value;
  });
  allKeys.sort();
  return JSON.stringify(obj, allKeys);
}

// Compute HMAC-SHA256. Returns lowercase hex.
async function computeHmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
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

    const { operation, target_entity, proposed_state, initiated_by, frame_type } = await req.json();

    if (!operation || !target_entity || !proposed_state || !initiated_by) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required parameters: operation, target_entity, proposed_state, initiated_by' 
      }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`[create-execution-frame] Creating frame for ${operation} on ${target_entity} by ${initiated_by}`);

    // Check if operation matches an approval gate
    const { data: gates } = await supabase
      .from("approval_gates")
      .select("*")
      .eq("active", true);

    let matchingGate = null;
    if (gates) {
      matchingGate = gates.find(gate => {
        // Check if operation pattern matches (supports regex or simple contains)
        const patternParts = gate.operation_pattern.split('|');
        const operationMatches = patternParts.some((pattern: string) => 
          operation.includes(pattern) || pattern.includes(operation)
        );
        
        // Check if entity type matches
        const entityType = target_entity.split(':')[0];
        const entityMatches = gate.entity_types.some((t: string) => 
          entityType === t || target_entity.startsWith(t)
        );
        
        return operationMatches && entityMatches;
      });
    }

    let approval_status = 'approved'; // default: auto-approve
    let requires_approval = false;
    let auto_approved = true;
    let constraint_violations: unknown[] = [];

    if (matchingGate) {
      console.log(`[create-execution-frame] Matched gate: ${matchingGate.gate_name}`);
      requires_approval = matchingGate.requires_approval;

      // Check auto-approve conditions
      if (matchingGate.auto_approve_conditions && 
          Object.keys(matchingGate.auto_approve_conditions).length > 0) {
        const conditions = matchingGate.auto_approve_conditions;
        
        // Handle data_check conditions
        if (conditions.data_check) {
          const entity_id = target_entity.split(':')[1];
          const entityType = target_entity.split(':')[0];
          const tableName = entityType === 'course' ? 'courses' : 
                           entityType === 'processing_queue' ? 'processing_queue' : 
                           entityType;
          
          const { data: entity } = await supabase
            .from(tableName)
            .select("*")
            .eq("id", entity_id)
            .single();

          if (entity) {
            const conditionsMet = Object.entries(conditions.data_check).every(([key, value]) => {
              if (value === 'not_null') {
                const fieldValue = entity[key];
                // Check for meaningful data, not just not-null
                if (Array.isArray(fieldValue)) {
                  return fieldValue.length > 0;
                }
                if (typeof fieldValue === 'object') {
                  return fieldValue !== null && Object.keys(fieldValue).length > 0;
                }
                return fieldValue != null && fieldValue !== '';
              }
              return true;
            });

            if (!conditionsMet && matchingGate.requires_approval) {
              approval_status = 'pending';
              auto_approved = false;
              console.log(`[create-execution-frame] Auto-approve conditions not met, requiring approval`);
            } else if (conditionsMet) {
              console.log(`[create-execution-frame] Auto-approve conditions met`);
            }
          } else {
            // Entity not found - require approval for safety
            if (matchingGate.requires_approval) {
              approval_status = 'pending';
              auto_approved = false;
            }
          }
        }

        // Handle previous_step_completed condition
        if (conditions.previous_step_completed === true) {
          // This is auto-approved if previous step completed (handled by caller context)
          console.log(`[create-execution-frame] previous_step_completed condition - auto-approved`);
        }
      } else if (matchingGate.requires_approval) {
        // No auto-approve conditions but requires approval
        approval_status = 'pending';
        auto_approved = false;
      }
    }

    // Run constraint check before creating frame
    const entity_id = target_entity.split(':')[1];
    const entityType = target_entity.split(':')[0];
    
    if (entity_id && entityType) {
      const constraintCheck = await supabase.functions.invoke('check-constraint-violations', {
        body: {
          entity_type: entityType,
          entity_id,
          proposed_operation: { operation, ...proposed_state }
        }
      });

      if (constraintCheck.data && !constraintCheck.data.valid) {
        constraint_violations = constraintCheck.data.violations || [];
        // Critical violations block execution
        const hasCritical = constraint_violations.some(
          (v: unknown) => {
            const violation = v as { severity?: string };
            return violation.severity === 'critical';
          }
        );
        if (hasCritical) {
          approval_status = 'rejected';
          auto_approved = false;
          console.log(`[create-execution-frame] Critical constraint violations - frame rejected`);
        }
      }
    }

    // Determine frame type
    const resolvedFrameType = frame_type || 
      (requires_approval && !auto_approved ? 'human_approval' : 
       operation === 'recovery' ? 'recovery' : 
       'ai_execution');

    // Create execution frame
    const { data: frame, error: insertError } = await supabase
      .from("execution_frames")
      .insert({
        frame_type: resolvedFrameType,
        initiated_by,
        target_entity,
        target_operation: operation,
        proposed_state,
        approval_status,
        constraint_violations,
        executed: approval_status === 'approved',
        executed_at: approval_status === 'approved' ? new Date().toISOString() : null,
        approved_by: auto_approved ? 'auto:' + initiated_by : null,
        approved_at: auto_approved && approval_status === 'approved' ? new Date().toISOString() : null,
        metadata: {
          matching_gate: matchingGate?.gate_name || null,
          auto_approved,
          constraint_check_passed: constraint_violations.length === 0
        }
      })
      .select()
      .single();

    if (insertError || !frame) {
      console.error(`[create-execution-frame] Failed to create frame:`, insertError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: insertError?.message || 'Failed to create execution frame' 
      }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`[create-execution-frame] Created frame ${frame.id}: ${approval_status}, auto_approved=${auto_approved}`);

    // Generate approval_token for frames that require human sign-off.
    // This is HMAC-SHA256(canonical(proposed_state):frame_id, GOVERNANCE_SIGNING_KEY).
    // The approver must pass this token as approval_signature — the server re-derives
    // it on approval to verify the payload has not been tampered with.
    let approvalToken: string | null = null;
    if (approval_status === 'pending') {
      const signingKey = Deno.env.get("GOVERNANCE_SIGNING_KEY");
      if (signingKey) {
        const canonicalPayload = canonicalize(frame.proposed_state);
        approvalToken = await computeHmac(`${canonicalPayload}:${frame.id}`, signingKey);
      } else {
        console.warn("[create-execution-frame] GOVERNANCE_SIGNING_KEY not set — approval_token not generated");
      }
    }

    return new Response(JSON.stringify({
      success: true,
      frame_id: frame.id,
      requires_approval,
      auto_approved,
      approval_status,
      execution_status: approval_status === 'approved' ? 'executed' : 'pending_approval',
      constraint_violations,
      matching_gate: matchingGate?.gate_name || null,
      // Included only when human approval is required. Pass as approval_signature.
      ...(approvalToken !== null && { approval_token: approvalToken })
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[create-execution-frame] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
