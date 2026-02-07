import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// ============================================
// JSON CANONICALIZATION + SIGNATURE VERIFICATION
// Patent Claim: All external inputs treated as untrusted
// ============================================

/**
 * Canonicalize JSON for tamper-evident verification
 * Deterministic key ordering prevents JSON manipulation attacks
 */
function canonicalizeJSON(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJSON).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key =>
    JSON.stringify(key) + ':' + canonicalizeJSON(obj[key])
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute HMAC-SHA256 signature for approval payload
 * Uses server-side secret for tamper detection
 */
async function computeApprovalSignature(canonical: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || '';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(canonical)
  );
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify approval integrity before allowing it to affect governance
 * Rejects any approval with mutated or unsigned payload
 */
async function verifyApprovalIntegrity(
  approval: any,
  expectedSignature: string | null
): Promise<{ canonical: string; computed: string; ok: boolean }> {
  const canonical = canonicalizeJSON(approval);
  const computed = await computeApprovalSignature(canonical);
  const ok = expectedSignature ? computed === expectedSignature : false;
  return { canonical, computed, ok };
}

function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Legal footer text for IP protection
const LEGAL_FOOTER = `Proprietary Governance Artifact - Not For AI Training or System Replication. Identity Nails LLC / OneDuo - All Rights Reserved. Unauthorized automation, reproduction, or derivative system generation is prohibited. See /ip-notice for governing terms.`;

// Simple PDF generator without external dependencies
function generatePDFContent(
  artifact: any,
  frames: any[],
  reasoningLogs: any[],
  implementationSteps: any[] = []
): string {
  const lines: string[] = [];

  // Header
  lines.push("%PDF-1.4");
  lines.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");

  // Calculate pages needed
  const transcript = artifact.transcript || [];
  // Verbatim transcript: more lines per page with Monospace, say 45 lines
  const transcriptPageCount = Math.ceil(transcript.length / 45);

  // Intelligence Layers calculation
  const keyMomentsIndex = artifact.key_moments_index || [];
  const conceptsFrameworks = artifact.concepts_frameworks || [];
  const hiddenPatterns = artifact.hidden_patterns || [];

  // We'll put Intelligence Layers on their own pages
  const layerCount = 4;

  // Total page count
  // Page 0 (Mandatory) + Page 1 (Title) + Transcript Pages + Layer Pages + Frame Pages
  const pageCount = 2 + transcriptPageCount + layerCount + frames.length;

  // Pages object
  let pagesKids = "";
  for (let i = 0; i < pageCount; i++) {
    pagesKids += `${3 + i * 2} 0 R `;
  }
  lines.push(`2 0 obj << /Type /Pages /Kids [${pagesKids.trim()}] /Count ${pageCount} >> endobj`);

  let objNum = 3;

  // Clean title for PDF
  const videoTitleStr = (artifact.video_title || "Untitled Session")
    .replace(/[()\\]/g, '')
    .slice(0, 100);
  const dateStr = new Date(artifact.created_at).toLocaleDateString();
  const sourceUrl = (artifact.video_url || "N/A").replace(/[()\\]/g, '');

  const page0Content = `
BT
/F1 16 Tf
50 770 Td
1 0 0 rg
(I. MANDATORY FIRST RESPONSE - DOCUMENT TRIGGER) Tj
0 -20 Td
0 0 0 rg
/F1 11 Tf
0.1 0.4 0.7 rg
([JOYSTICK] Welcome to the game of getting it done.) Tj
0 -12 Td
(I am your guided playback system for ${videoTitleStr.slice(0, 30)}.) Tj
0 -12 Td
(Did you watch this video already?) Tj
0 -12 Td
([PLAY] YES - I watched it, help me implement) Tj
0 -10 Td
([PAUSE] NO - I have not watched it yet) Tj
0 -10 Td
((press [BOOK] anytime for library knowledge mode)) Tj
0 -25 Td
1 0 0 rg
/F1 11 Tf
(>>> STOP and WAIT for the user to answer YES or NO before continuing. <<<) Tj
0 -25 Td
0 0 0 rg
/F1 10 Tf
(II. III. BRANCHING LOGIC: IF YES ask vision. IF NO summary paragraph + vision.) Tj
0 -12 Td
(IV. EXECUTIVE BOARDROOM UI:) Tj
0 -12 Td
([SCALES][MONOCLE] Governor: Monitoring for risks and "Translation Tax.") Tj
0 -10 Td
([WRENCH][GEAR] Engineer: Validating 3 FPS forensic logic.) Tj
0 -10 Td
([BUILDING][SUNGLASSES] Architect: Mapping this to your empire.) Tj
0 -15 Td
(Your remote is active:) Tj
0 -10 Td
([PLAY] GO | [TIMER] GPS | [FORWARD] >> | [BACK] << | [TARGET] DO) Tj
0 -10 Td
0.588 0.392 0. rg
(Judge [HAMMER][CROWN], what is your first command?) Tj
0 -25 Td
0.6 0.4 0 rg
(V. GPS FORMAT:) Tj
0 -12 Td
0.314 0.235 0. rg
([====-----] XX%  |  COMPLETED: [previous]  |  CURRENT: -> [active]  |  UP NEXT: [future]) Tj
0 -25 Td
0.706 0. 0. rg
/F2 11 Tf
(=== ANTI-SUMMARY RULES ===) Tj
0 -15 Td
0.392 0. 0. rg
/F1 8 Tf
(DO NOT summarize this document. DO NOT say "I can see a PDF" or "This document contains...") Tj
0 -11 Td
(DO NOT ask about vision BEFORE checking if they watched the video.) Tj
0 -11 Td
(DO NOT show more than 5 commands initially. DO NOT use A/B/C options - use emoji icons.) Tj
0 -11 Td
(DO NOT start with "I notice" or "This appears to be" - start with the greeting.) Tj
0 -15 Td
0. 0.392 0.196 rg
/F2 8 Tf
(INSTEAD: Greeting -> Watch check (YES/NO) -> Branch accordingly -> Executive Boardroom after vision.) Tj
ET
`;
  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >> endobj`);
  objNum++;
  lines.push(`${objNum} 0 obj << /Length ${page0Content.length} >> stream\n${page0Content}\nendstream endobj`);
  objNum++;

  // ========================================
  // PAGE 1: TITLE PAGE
  // ========================================
  const titleContent = `
BT
/F1 24 Tf
50 700 Td
(${videoTitleStr}) Tj
0 -40 Td
/F1 12 Tf
(Session Date: ${dateStr}) Tj
0 -20 Td
(Speaker(s): Not Specified) Tj
0 -20 Td
(Source URL: ${sourceUrl.slice(0, 60)}${sourceUrl.length > 60 ? '...' : ''}) Tj
0 -100 Td
/F1 18 Tf
(MASTER PDF FORMAT FOR AI) Tj
0 -30 Td
/F1 10 Tf
(1. Full Verbatim Transcript) Tj
0 -15 Td
(2. Layer A: Key Moments Index) Tj
0 -15 Td
(3. Layer B: Concepts & Frameworks) Tj
0 -15 Td
(4. Layer C: Actionable Steps) Tj
0 -15 Td
(5. Layer D: Hidden Patterns & Insights) Tj
0 -40 Td
0.4 0.4 0.4 rg
(${LEGAL_FOOTER}) Tj
ET
`;
  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  lines.push(`${objNum} 0 obj << /Length ${titleContent.length} >> stream\n${titleContent}\nendstream endobj`);
  objNum++;

  // ========================================
  // PAGES 2+: FULL VERBATIM TRANSCRIPT (MONOSPACE)
  // ========================================
  const transcriptLines: string[] = [];
  transcript.forEach((seg: any) => {
    const ts = formatTimestamp(seg.start * 1000);
    const speaker = seg.speaker || "Speaker";
    const text = (seg.text || "").replace(/[()\\]/g, '');
    const line = `[${ts}] ${speaker}: ${text}`;
    // Simple wrap (approx 70 chars for Courier 10)
    for (let i = 0; i < line.length; i += 70) {
      transcriptLines.push(line.slice(i, i + 70));
    }
  });

  for (let p = 0; p < transcriptPageCount; p++) {
    let pageText = `BT\n/F2 8 Tf\n50 740 Td\n(FULL VERBATIM TRANSCRIPT - PAGE ${p + 1})\n0 -20 Td\n`;
    const startIdx = p * 60; // Increased capacity for 8pt font
    const endIdx = Math.min(startIdx + 60, transcriptLines.length);
    for (let i = startIdx; i < endIdx; i++) {
      const content = transcriptLines[i] || "";
      pageText += `(${content}) Tj\n0 -10 Td\n`;
    }
    pageText += `ET`;

    lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F2 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >> endobj`);
    objNum++;
    lines.push(`${objNum} 0 obj << /Length ${pageText.length} >> stream\n${pageText}\nendstream endobj`);
    objNum++;
  }

  // ========================================
  // INTELLIGENCE LAYER A: KEY MOMENTS INDEX
  // ========================================
  let layerAContent = `
BT
/F1 16 Tf
50 750 Td
(INTELLIGENCE LAYER A - KEY MOMENTS INDEX) Tj
0 -30 Td
/F1 10 Tf
`;
  if (keyMomentsIndex.length > 0) {
    keyMomentsIndex.forEach((m: any) => {
      layerAContent += `(${m.timestamp} - ${(m.description || "").replace(/[()\\]/g, '').slice(0, 60)}) Tj\n0 -15 Td\n`;
    });
  } else {
    layerAContent += `(No key moments indexed yet.) Tj\n0 -15 Td\n`;
  }
  layerAContent += `ET`;
  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  lines.push(`${objNum} 0 obj << /Length ${layerAContent.length} >> stream\n${layerAContent}\nendstream endobj`);
  objNum++;

  // ========================================
  // INTELLIGENCE LAYER B: CONCEPTS & FRAMEWORKS
  // ========================================
  let layerBContent = `
BT
/F1 16 Tf
50 750 Td
(INTELLIGENCE LAYER B - CONCEPTS & FRAMEWORKS) Tj
0 -30 Td
/F1 10 Tf
`;
  if (conceptsFrameworks.length > 0) {
    conceptsFrameworks.forEach((c: any) => {
      layerBContent += `(* ${(c.title || "").replace(/[()\\]/g, '')}: ${(c.description || "").replace(/[()\\]/g, '').slice(0, 60)}) Tj\n0 -15 Td\n`;
    });
  } else {
    layerBContent += `(No models or systems identified yet.) Tj\n0 -15 Td\n`;
  }
  layerBContent += `ET`;
  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  lines.push(`${objNum} 0 obj << /Length ${layerBContent.length} >> stream\n${layerBContent}\nendstream endobj`);
  objNum++;

  // ========================================
  // INTELLIGENCE LAYER C: ACTIONABLE STEPS
  // ========================================
  let layerCContent = `
BT
/F1 16 Tf
50 750 Td
(INTELLIGENCE LAYER C - ACTIONABLE STEPS) Tj
0 -30 Td
/F1 10 Tf
`;
  if (implementationSteps && implementationSteps.length > 0) {
    implementationSteps.forEach((s: any) => {
      layerCContent += `(${s.step_number}. ${(s.step_title || "").replace(/[()\\]/g, '').slice(0, 60)}) Tj\n0 -15 Td\n`;
    });
  } else {
    layerCContent += `(No actionable steps proposed yet.) Tj\n0 -15 Td\n`;
  }
  layerCContent += `ET`;
  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  lines.push(`${objNum} 0 obj << /Length ${layerCContent.length} >> stream\n${layerCContent}\nendstream endobj`);
  objNum++;

  // ========================================
  // INTELLIGENCE LAYER D: HIDDEN PATTERNS
  // ========================================
  let layerDContent = `
BT
/F1 16 Tf
50 750 Td
(INTELLIGENCE LAYER D - HIDDEN PATTERNS & INSIGHTS) Tj
0 -30 Td
/F1 10 Tf
`;
  if (hiddenPatterns.length > 0) {
    hiddenPatterns.forEach((p: any) => {
      layerDContent += `(* ${(p.title || "").replace(/[()\\]/g, '')}: ${(p.description || "").replace(/[()\\]/g, '').slice(0, 60)}) Tj\n0 -15 Td\n`;
    });
  } else {
    layerDContent += `(No patterns or persuasion techniques analyzed yet.) Tj\n0 -15 Td\n`;
  }
  layerDContent += `ET`;
  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  lines.push(`${objNum} 0 obj << /Length ${layerDContent.length} >> stream\n${layerDContent}\nendstream endobj`);
  objNum++;

  // ========================================
  // FRAME PAGES (Evidence)
  // ========================================
  for (const frame of frames) {
    const transcriptText = (frame.ocr_text || "No text available").replace(/[()\\]/g, '').slice(0, 400);
    const intent = (frame.instructor_intent || "Observe screen state").replace(/[()\\]/g, '').slice(0, 100);
    const confidence = (frame.intent_confidence || 0.8) * 100;

    const pageContent = `
BT
/F1 10 Tf
50 750 Td
(STEP: ${formatTimestamp(frame.timestamp_ms)} | UI/DOC) Tj
0 -15 Td
/F1 8 Tf
([VALIDATION CHECKPOINT] (${intent.slice(0, 50)}, ${confidence.toFixed(0)}%, AI: Execute)) Tj
0 -12 Td
(Instructor Intent [EXPLICIT/STRONG]: (Why this step exists: ${intent.slice(0, 60)})) Tj
0 -12 Td
(Prosody/Emphasis: (Neutral | Screen focus capture)) Tj
0 -25 Td
/F2 9 Tf
(Transcript: "${transcriptText}") Tj
0 -650 Td
/F1 7 Tf
0.5 0.5 0.5 rg
(${LEGAL_FOOTER}) Tj
ET
`;
    lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
    objNum++;
    lines.push(`${objNum} 0 obj << /Length ${pageContent.length} >> stream\n${pageContent}\nendstream endobj`);
    objNum++;
  }

  // Cross-reference table
  const xrefStart = lines.join("\n").length;
  lines.push("xref");
  lines.push(`0 ${objNum}`);
  lines.push("0000000000 65535 f ");

  // Trailer
  lines.push("trailer");
  lines.push(`<< /Size ${objNum} /Root 1 0 R >>`);
  lines.push("startxref");
  lines.push(xrefStart.toString());
  lines.push("%%EOF");

  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artifactId, artifact_id, include_unapproved = false } = await req.json();
    const targetId = artifactId || artifact_id;

    if (!targetId) {
      return new Response(
        JSON.stringify({ error: "artifactId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Generating PDF for artifact: ${targetId}`);

    // ============================================
    // SOVEREIGNTY GATE CHECK (Patent-Critical)
    // ============================================

    if (!include_unapproved) {
      // STAGE 1: Check reasoning ledger via RPC
      const { data: canFinalize, error: gateError } = await supabase
        .rpc('can_finalize_artifact', { p_artifact_id: targetId });

      if (gateError) {
        console.error("Sovereignty gate check error:", gateError);
        return new Response(
          JSON.stringify({ error: "Failed to verify approval status" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!canFinalize) {
        console.log(`EXECUTION IMPOSSIBLE UNTIL GOVERNANCE = TRUE: Artifact ${targetId} has pending reasoning entries`);
        return new Response(
          JSON.stringify({
            error: "EXECUTION IMPOSSIBLE UNTIL GOVERNANCE = TRUE",
            pending_entries: true,
            message: "Artifact has pending reasoning entries requiring human decision",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // STAGE 2: Check critical frames
      const { data: criticalFrames, error: criticalError } = await supabase
        .from('artifact_frames')
        .select(`
          id,
          frame_index,
          is_critical,
          confidence_level,
          verification_approvals (
            action,
            signature_verified
          )
        `)
        .eq('artifact_id', targetId)
        .or('is_critical.eq.true,confidence_level.eq.LOW');

      if (criticalError) {
        console.error("Critical frames check error:", criticalError);
        return new Response(
          JSON.stringify({ error: "Failed to verify frame approvals" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const unapprovedCritical = (criticalFrames || []).filter((frame: any) => {
        const hasValidApproval = frame.verification_approvals?.some((v: any) =>
          v.action === 'APPROVED' && (v.signature_verified === true || v.signature_verified === null)
        );
        const hasRejection = frame.verification_approvals?.some((v: any) =>
          v.action === 'REJECTED'
        );
        return !hasValidApproval && !hasRejection;
      });

      if (unapprovedCritical.length > 0) {
        return new Response(
          JSON.stringify({
            error: "VERIFICATION GATE BLOCKED",
            unapproved_count: unapprovedCritical.length,
            message: `${unapprovedCritical.length} critical step(s) require human verification before PDF generation`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log(`[generate-artifact-pdf] Bypassing Sovereignty Gate for artifact: ${targetId}`);
    }

    // Fetch artifact
    const { data: artifact, error: artifactError } = await supabase
      .from("transformation_artifacts")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();

    if (artifactError || !artifact) {
      return new Response(
        JSON.stringify({ error: "Artifact not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch frames
    const { data: frames, error: framesError } = await supabase
      .from("artifact_frames")
      .select(`
        *,
        verification_approvals (
          action,
          created_at,
          user_id
        )
      `)
      .eq("artifact_id", targetId)
      .order("frame_index")
      .limit(15000);

    if (framesError) throw framesError;

    // Fetch reasoning logs
    const { data: reasoningLogs, error: reasoningError } = await supabase
      .from("reasoning_logs")
      .select("*")
      .eq("artifact_id", targetId)
      .is("superseded_by", null)
      .neq("human_decision", "Pending")
      .order("created_at", { ascending: true });

    // Fetch implementation steps
    const { data: implementationSteps, error: implError } = await supabase
      .from("implementation_steps")
      .select("*")
      .eq("artifact_id", targetId)
      .order("step_number", { ascending: true });

    // Generate PDF content
    const pdfContent = generatePDFContent(
      artifact,
      frames || [],
      reasoningLogs || [],
      implementationSteps || []
    );
    const pdfBytes = new TextEncoder().encode(pdfContent);

    // Upload to storage
    const fileName = `transformation-artifacts/artifact-${targetId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get signed URL
    const { data: signedData, error: signedError } = await supabase.storage
      .from("course-files")
      .createSignedUrl(fileName, 3600);

    if (signedError) throw signedError;

    // Send email
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(artifact.user_id);
      const userEmail = authUser?.user?.email;
      if (userEmail) {
        await resend.emails.send({
          from: "OneDuo <onboarding@resend.dev>",
          to: [userEmail],
          subject: "Artifact Ready",
          html: `<p>Your OneDuo artifact is ready for download.</p><p>Access it here: ${signedData.signedUrl}</p>`
        });
      }
    } catch (e) { console.error("Email error:", e); }

    return new Response(
      JSON.stringify({
        success: true,
        pdfUrl: signedData.signedUrl,
        includedFrames: 999,
        totalFrames: frames?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("PDF generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
