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

    const { frame_id, approved_by, decision, decision_notes } = await req.json();

    if (!frame_id || !approved_by || !decision) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required parameters: frame_id, approved_by, decision' 
      }), { 
        status: 400,
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
      // Mark as expired
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
          decision_timestamp: now
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
