import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Approve Execution Frame
 *
 * Human approval of pending frames.
 * Part of the OneDuo Governance Layer.
 *
 * This function handles human decisions on pending execution frames.
 * Approvals are cryptographically verified: the approval_signature must be the
 * HMAC-SHA256 token issued by create-execution-frame at frame creation time.
 * This binds the human's approval to the exact proposed_state — if the payload
 * was tampered with after issuance, verification fails and execution is blocked.
 */

// Canonicalize an object by sorting all keys recursively (Moat #4)
function canonicalize(obj: unknown): string {
  const allKeys: string[] = [];
  JSON.stringify(obj, (key, value) => {
    allKeys.push(key);
    return value;
  });
  allKeys.sort();
  return JSON.stringify(obj, allKeys);
}

// Compute HMAC-SHA256 over a message using a secret key. Returns lowercase hex.
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

// Constant-time string comparison to prevent timing attacks
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fail closed: signing key must be present — no silent degradation
    const signingKey = Deno.env.get("GOVERNANCE_SIGNING_KEY");
    if (!signingKey) {
      console.error("[approve-execution-frame] GOVERNANCE_SIGNING_KEY not set — cannot verify approvals");
      return new Response(JSON.stringify({
        success: false,
        error: "Governance configuration error: signing key unavailable"
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { frame_id, approved_by, decision, decision_notes, approval_signature } = await req.json();

    if (!frame_id || !approved_by || !decision) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameters: frame_id, approved_by, decision'
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // MANDATORY: approvals require a signature — presence check first
    if (decision === 'approved' && !approval_signature) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Governance Violation: Approval requires a cryptographic signature.'
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Validate decision
    if (!['approved', 'rejected'].includes(decision)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid decision. Must be "approved" or "rejected"'
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[approve-execution-frame] Processing ${decision} for frame ${frame_id} by ${approved_by}`);

    // Get the frame
    const { data: frame, error: fetchError } = await supabase
      .from("execution_frames")
      .select("*")
      .eq("id", frame_id)
      .single();

    if (fetchError || !frame) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Frame not found'
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if frame is pending
    if (frame.approval_status !== 'pending') {
      return new Response(JSON.stringify({
        success: false,
        error: `Frame already processed: ${frame.approval_status}`,
        current_status: frame.approval_status
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if frame has expired (1 hour timeout)
    const frameAge = Date.now() - new Date(frame.initiated_at).getTime();
    const oneHourMs = 60 * 60 * 1000;
    if (frameAge > oneHourMs) {
      await supabase.from("execution_frames").update({
        approval_status: 'expired',
        metadata: {
          ...frame.metadata,
          expired_at: new Date().toISOString(),
          expired_reason: 'timeout_1_hour'
        }
      }).eq("id", frame_id);

      return new Response(JSON.stringify({
        success: false,
        error: 'Frame has expired (>1 hour old)',
        frame_id
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cryptographic verification — the core non-bypassability claim.
    //
    // Re-derive the expected HMAC from the frame's canonical proposed_state + frame_id.
    // This binds the approval to the exact payload that was created — if anyone tampered
    // with proposed_state after issuance, the HMAC will not match and execution is blocked.
    //
    // The client obtains the approval_token from create-execution-frame at frame creation
    // and passes it back unchanged as approval_signature.
    const canonicalPayload = canonicalize(frame.proposed_state);
    const signingMessage = `${canonicalPayload}:${frame_id}`;
    const expectedHmac = await computeHmac(signingMessage, signingKey);

    let signatureVerified = false;

    if (decision === 'approved') {
      signatureVerified = safeEqual(approval_signature, expectedHmac);

      if (!signatureVerified) {
        console.error(`[approve-execution-frame] Signature verification FAILED for frame ${frame_id}`);
        return new Response(JSON.stringify({
          success: false,
          error: 'Governance Violation: Signature verification failed — approval not bound to this payload.'
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      console.log(`[approve-execution-frame] Signature verified for frame ${frame_id}`);
    }

    // Update frame with decision
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("execution_frames")
      .update({
        approval_status: decision,
        approved_by,
        approved_at: now,
        executed: decision === 'approved',
        executed_at: decision === 'approved' ? now : null,
        metadata: {
          ...frame.metadata,
          decision_notes: decision_notes || null,
          decision_timestamp: now,
          approval_signature: approval_signature || null,
          payload_hash_at_approval: expectedHmac,
          signature_verified: signatureVerified
        }
      })
      .eq("id", frame_id);

    if (updateError) {
      console.error(`[approve-execution-frame] Failed to update frame:`, updateError);
      return new Response(JSON.stringify({
        success: false,
        error: updateError.message
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If approved, resolve any related constraint violations
    if (decision === 'approved') {
      const [entityType, entityId] = frame.target_entity.split(':');

      if (entityType && entityId) {
        // Resolve violations for this entity
        await supabase.from("constraint_violations").update({
          resolved: true,
          resolved_by: approved_by,
          resolved_at: now,
          resolution_frame_id: frame_id
        }).eq("entity_type", entityType)
          .eq("entity_id", entityId)
          .eq("resolved", false);

        // Update course constraint status if applicable
        if (entityType === 'course') {
          await supabase.from("courses").update({
            constraint_status: 'valid',
            current_frame_id: frame_id,
            last_constraint_check: now
          }).eq("id", entityId);
        }

        // Log the state transition
        await supabase.from("state_transitions").insert({
          frame_id,
          entity_type: entityType,
          entity_id: entityId,
          from_state: { approval_status: 'pending' },
          to_state: frame.proposed_state,
          transition_type: 'human_approval',
          triggered_by: approved_by
        });
      }

      console.log(`[approve-execution-frame] Frame ${frame_id} approved and executed`);
    } else {
      console.log(`[approve-execution-frame] Frame ${frame_id} rejected by ${approved_by}`);
    }

    return new Response(JSON.stringify({
      success: true,
      frame_id,
      decision,
      approved_by,
      approved_at: now,
      target_entity: frame.target_entity,
      target_operation: frame.target_operation
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[approve-execution-frame] Error:", error);
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
