import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Must be identical to canonicalizeJSON in approve-governance-frame and generate-artifact-pdf
function canonicalizeJSON(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + (obj as unknown[]).map(canonicalizeJSON).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map(
    (key) => JSON.stringify(key) + ":" + canonicalizeJSON((obj as Record<string, unknown>)[key])
  );
  return "{" + pairs.join(",") + "}";
}

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
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const signingKey = Deno.env.get("GOVERNANCE_SIGNING_KEY");
  if (!signingKey) {
    console.error("[generate-governance-token] GOVERNANCE_SIGNING_KEY not set");
    return new Response(
      JSON.stringify({ error: "Governance configuration error: signing key unavailable" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { action, frame_id, artifact_id } = await req.json();

    if (!action || !frame_id || !artifact_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: action, frame_id, artifact_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["APPROVED", "REJECTED"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be APPROVED or REJECTED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate user — user_id must be part of the canonical object
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

    // Canonical object — must be identical to what approve-governance-frame verifies against
    const canonicalObj = { action, artifact_id, frame_id, user_id: user.id };
    const canonical = canonicalizeJSON(canonicalObj);
    const approval_token = await computeHmac(canonical, signingKey);

    console.log(`[generate-governance-token] ${action} | frame: ${frame_id} | user: ${user.id} | token: ${approval_token.substring(0, 16)}...`);

    return new Response(
      JSON.stringify({ approval_token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-governance-token] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
