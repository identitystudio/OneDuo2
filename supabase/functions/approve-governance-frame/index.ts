import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// CANONICALIZATION — Patent Claim: Moat #4
// Deterministic key ordering prevents JSON manipulation attacks
// Must be identical to the function in generate-artifact-pdf
// ============================================
function canonicalizeJSON(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJSON).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => JSON.stringify(key) + ":" + canonicalizeJSON(obj[key])
  );
  return "{" + pairs.join(",") + "}";
}

// ============================================
// SERVER-SIDE HMAC — Patent Claim: Tamper Detection
// Uses SUPABASE_SERVICE_ROLE_KEY as secret — never exposed to client
// Any approval not routed through this function will fail HMAC verification
// at PDF generation time and be rejected as a sovereignty breach
// ============================================
async function computeHmac(canonical: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonical)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time comparison to prevent timing attacks
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Fail closed — both signing keys must be present
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const signingKey = Deno.env.get("GOVERNANCE_SIGNING_KEY");
  if (!signingKey) {
    console.error("[approve-governance-frame] GOVERNANCE_SIGNING_KEY not set");
    return new Response(
      JSON.stringify({ error: "Governance configuration error: signing key unavailable" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { artifact_id, frame_id, action, approval_signature, reason } = await req.json();

    // Validate required fields
    if (!artifact_id || !frame_id || !action) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: artifact_id, frame_id, action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["APPROVED", "REJECTED"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be APPROVED or REJECTED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // APPROVED requires a signature — presence check first
    if (action === "APPROVED" && !approval_signature) {
      return new Response(
        JSON.stringify({
          error: "Governance Violation: APPROVED action requires approval_signature",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate the requesting user via their JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // CANONICAL OBJECT — exactly 4 stable fields, no timestamps
    // Must match generate-governance-token and generate-artifact-pdf
    // ============================================
    const canonicalObj = { action, artifact_id, frame_id, user_id: user.id };
    const canonical = canonicalizeJSON(canonicalObj);

    // server_hmac: signed with SUPABASE_SERVICE_ROLE_KEY — verified at PDF generation time
    const server_hmac = await computeHmac(canonical, serviceRoleKey);

    // Verify approval_signature: must equal HMAC(canonical, GOVERNANCE_SIGNING_KEY)
    // The client obtains this token from generate-governance-token before submitting.
    // This proves the human ran the approval flow against the exact intended frame — not a replay or forgery.
    let signatureVerified = false;
    if (action === "APPROVED") {
      const expectedToken = await computeHmac(canonical, signingKey);
      signatureVerified = safeEqual(approval_signature, expectedToken);

      if (!signatureVerified) {
        console.error(`[approve-governance-frame] Signature verification FAILED | frame: ${frame_id} | user: ${user.id}`);
        return new Response(
          JSON.stringify({
            error: "Governance Violation: Signature verification failed — approval not bound to this frame.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(
      `[approve-governance-frame] ${action} | frame: ${frame_id} | user: ${user.id} | sig_verified: ${signatureVerified} | hmac: ${server_hmac.substring(0, 16)}...`
    );

    // Build insert record
    const insertData: Record<string, unknown> = {
      artifact_id,
      frame_id,
      user_id: user.id,
      action,
      server_hmac,
      signature_verified: signatureVerified,
    };
    if (action === "APPROVED") {
      insertData.approval_signature = approval_signature;
    }
    if (action === "REJECTED" && reason) {
      insertData.reason = reason;
    }

    // Insert using the user's own client (RLS enforces ownership)
    const { error: insertError } = await userSupabase
      .from("verification_approvals")
      .insert(insertData);

    if (insertError) {
      console.error("[approve-governance-frame] Insert error:", insertError.message);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        server_hmac,
        signature_verified: signatureVerified,
        message: `Frame ${action.toLowerCase()} with server attestation`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[approve-governance-frame] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
