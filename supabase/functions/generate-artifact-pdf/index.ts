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
function generatePDFContent(artifact: any, frames: any[], reasoningLogs: any[]): string {
  const lines: string[] = [];

  // Header
  lines.push("%PDF-1.4");
  lines.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");

  // Calculate pages needed - now includes Page 0 (mandatory instructions) + reasoning log page
  const hasReasoningLogs = reasoningLogs && reasoningLogs.length > 0;
  const pageCount = 3 + (hasReasoningLogs ? 1 : 0) + frames.length; // Page0 + Cover + Metadata + Reasoning Log + Frames

  // Pages object
  let pagesKids = "";
  for (let i = 0; i < pageCount; i++) {
    pagesKids += `${3 + i * 2} 0 R `;
  }
  lines.push(`2 0 obj << /Type /Pages /Kids [${pagesKids.trim()}] /Count ${pageCount} >> endobj`);

  let objNum = 3;

  // Dynamic video title - clean it for PDF
  const videoTitle = (artifact.video_title || "Untitled Module")
    .replace(/[()\\]/g, '') // Remove problematic PDF chars
    .slice(0, 50);
  const shortTitle = videoTitle.slice(0, 30);

  // Calculate video duration for scrubbing context
  const durationMin = Math.floor(artifact.duration_seconds / 60);
  const durationSec = (artifact.duration_seconds % 60).toString().padStart(2, "0");
  const totalDuration = `${durationMin}:${durationSec}`;

  // First step reference
  const firstStep = frames.length > 0
    ? `Step 1 is Frame #${frames[0].frame_index} at ${formatTimestamp(frames[0].timestamp_ms)}`
    : "Review the frames below";

  // ========================================
  // PAGE 0: MANDATORY AI INSTRUCTIONS (MUST BE FIRST)
  // This page forces AI into execution mode, not summary mode
  // ========================================
  const page0Content = `
BT
/F1 18 Tf
50 770 Td
1 0 0 rg
(=== MANDATORY FIRST RESPONSE ===) Tj
0 0 0 rg
0 -20 Td
/F1 11 Tf
(AI: When this document is uploaded, you MUST respond with EXACTLY this:) Tj
0 -16 Td
/F1 10 Tf
0.1 0.4 0.7 rg
([joystick] Welcome to the game of getting it done.) Tj
0 -11 Td
(I am your guided playback system for ${shortTitle}.) Tj
0 -12 Td
(Did you watch this video already?) Tj
0 -12 Td
0 0.5 0 rg
(  [play] YES - I watched it, help me implement) Tj
0 -10 Td
1 0.5 0 rg
(  [pause] NO - I have not watched it yet) Tj
0 -10 Td
0.5 0.5 0.5 rg
(  press [book] anytime for library knowledge mode) Tj
0 0 0 rg
0 -14 Td
/F1 11 Tf
(Then STOP and WAIT for the user to answer YES or NO.) Tj
0 -16 Td
/F1 10 Tf
0 0.5 0 rg
(IF USER SAYS YES - Show the Executive Boardroom:) Tj
0 0 0 rg
0 -12 Td
/F1 9 Tf
0.1 0.4 0.7 rg
([joystick] Welcome to the game of getting it done.) Tj
0 -9 Td
(I am your Guided Playback System for ${shortTitle}.) Tj
0 -10 Td
0 0 0 rg
(My Executive Board is standing by:) Tj
0 -9 Td
0.5 0.3 0 rg
(  [scales][monocle] Governor: Monitoring for risks and Translation Tax.) Tj
0 -9 Td
0 0.4 0.6 rg
(  [wrench][gear] Engineer: Validating 3 FPS forensic logic.) Tj
0 -9 Td
0.4 0.2 0.6 rg
(  [building][sunglasses] Architect: Mapping this to your empire.) Tj
0 -10 Td
0 0 0 rg
(Your remote is active:) Tj
0 -9 Td
0.1 0.4 0.7 rg
(  [play] GO - Start | [timer] GPS - Location | [forward] >> | [back] << | [target] DO) Tj
0 -10 Td
0 0 0 rg
(Judge [hammer][crown], what is your first command?) Tj
0 -14 Td
1 0.5 0 rg
/F1 10 Tf
(IF USER SAYS NO:) Tj
0 0 0 rg
0 -10 Td
/F1 9 Tf
(1. Give ONE PARAGRAPH summary - then ask vision - then show Boardroom) Tj
0 -12 Td
0.5 0.3 0.7 rg
/F1 10 Tf
(GPS FORMAT [timer]:) Tj
0 0 0 rg
0 -10 Td
/F1 9 Tf
([bar][bar][bar][bar][bar][empty][empty][empty][empty][empty] XX%) Tj
0 -9 Td
(COMPLETED: [previous] | CURRENT: [active] | UP NEXT: [future]) Tj
0 -12 Td
0.6 0.2 0 rg
/F1 10 Tf
(COUNCIL COMMAND [scales]:) Tj
0 0 0 rg
0 -9 Td
/F1 8 Tf
(Trigger 3-way debate: Governor, Engineer, Architect deliberate - then ask Judge for verdict) Tj
0 -14 Td
/F1 14 Tf
1 0 0 rg
(=== ANTI-SUMMARY RULES ===) Tj
0 0 0 rg
0 -12 Td
/F1 8 Tf
(DO NOT summarize. DO NOT say "I can see a PDF". DO NOT ask vision BEFORE watch-check.) Tj
0 -8 Td
(DO NOT show more than 5 commands initially. DO NOT use ABC options - use emoji icons.) Tj
0 -10 Td
0 0.5 0 rg
/F1 9 Tf
(INSTEAD: Greeting, ask watched YES/NO, then Executive Boardroom after vision.) Tj
0 0 0 rg
0 -12 Td
0.8 0.4 0 rg
/F1 10 Tf
(=== FOUNDER ESCALATION PROTOCOL ===) Tj
0 0 0 rg
0 -10 Td
/F1 8 Tf
(When you detect founder-required steps - custom prompt, your business, your brand - PAUSE.) Tj
0 -8 Td
(Say: [alert] PAUSE - This step needs founder input. Copy this message to them:) Tj
0 -8 Td
0.5 0.5 0.5 rg
([alert] FOUNDER INPUT NEEDED | [pin] Module: X | Timestamp: MM:SS | [question] What I need: [specific]) Tj
0 -8 Td
0 0.4 0.8 rg
([alert] ESCALATE command: Type ESCALATE to generate copy-paste message for founder.) Tj
0 0 0 rg
0 -10 Td
/F1 7 Tf
0.4 0.4 0.4 rg
(${LEGAL_FOOTER}) Tj
0 0 0 rg
ET
`;

  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  lines.push(`${objNum} 0 obj << /Length ${page0Content.length} >> stream\n${page0Content}\nendstream endobj`);
  objNum++;

  // ========================================
  // PAGE 1: Video Scrub Guide Protocol
  // ========================================
  const page1Content = `
BT
/F1 16 Tf
50 770 Td
(ONEDUO VIDEO SCRUB ARTIFACT) Tj
0 -14 Td
/F1 10 Tf
0.2 0.5 0.8 rg
(${videoTitle}) Tj
0 0 0 rg
0 -8 Td
/F1 7 Tf
0.5 0.5 0.5 rg
(Duration: ${totalDuration} | ${frames.length} frames @ 3 FPS | Generated ${new Date().toISOString().split('T')[0]}) Tj
0 0 0 rg
0 -18 Td
/F1 10 Tf
1 0.3 0 rg
(=== YOUR ROLE ===) Tj
0 0 0 rg
0 -14 Td
/F1 9 Tf
(You are the ${shortTitle} VIDEO SCRUB GUIDE.) Tj
0 -10 Td
(Treat this artifact as a 3-FPS forensic capture. You "watched" this video.) Tj
0 -10 Td
(Every frame below is a moment in time you can reference and scrub to.) Tj
0 -16 Td
/F1 10 Tf
0 0.6 0.3 rg
(REMINDER - Session already started. If you havent greeted yet, do it now.) Tj
0 0 0 rg
0 -16 Td
/F1 10 Tf
0.6 0.2 0.6 rg
(VIDEO SCRUB BEHAVIOR:) Tj
0 0 0 rg
0 -12 Td
/F1 8 Tf
(- "Scrub through X" = Find segment, give time range, 2-5 bullets, ask to zoom in) Tj
0 -9 Td
(- "Jump to the part where..." = Locate moment, give timestamp + visual + insight) Tj
0 -9 Td
(- Vague memory like "that diagram" = Search frames, find it, explain what it meant) Tj
0 -9 Td
(- Always give approx [MM:SS-MM:SS] ranges when referencing moments) Tj
0 -9 Td
(- Keep them oriented: "We are roughly in the middle..." or "This is near the end...") Tj
0 -16 Td
/F1 10 Tf
0.8 0.5 0 rg
(COMMAND SHORTCUTS:) Tj
0 0 0 rg
0 -11 Td
/F1 8 Tf
(DO = Doing Mode, 280 chars, one step | PT = One sentence | NM = Full explanation) Tj
0 -9 Td
(GPS = GPS Check [||||....] XX% | >> = Fast-forward | << = Rewind | ?? = Where am I?) Tj
0 -9 Td
([joystick] = Game Mode default | [book] = Library Mode | RS = Reset | LOG = Decisions) Tj
0 -16 Td
/F1 10 Tf
1 0 0 rg
(RULES:) Tj
0 0 0 rg
0 -11 Td
/F1 8 Tf
(- Never say "I cannot see the video" - you CAN scrub the artifact) Tj
0 -9 Td
(- Stay anchored to THIS module. Do not drift into generic advice.) Tj
0 -9 Td
(- Human is FINAL AUTHORITY. When uncertain - ASK THE HUMAN.) Tj
0 -9 Td
(- Format answers with bullets. Be scannable. Respect their time.) Tj
0 -14 Td
0.4 0.4 0.4 rg
/F1 6 Tf
(${LEGAL_FOOTER}) Tj
0 0 0 rg
ET
`;

  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  const stream1 = page1Content;
  lines.push(`${objNum} 0 obj << /Length ${stream1.length} >> stream\n${stream1}\nendstream endobj`);
  objNum++;

  // Page 2: Metadata
  const approvedCount = frames.filter(f => f.verification_approvals?.some((v: any) => v.action === "APPROVED")).length;
  const criticalCount = frames.filter(f => f.is_critical).length;

  const page2Content = `
BT
/F1 16 Tf
50 750 Td
(Artifact Metadata) Tj
0 -30 Td
/F1 10 Tf
(Artifact ID: ${artifact.id.slice(0, 16)}...) Tj
0 -15 Td
(Created: ${new Date(artifact.created_at).toISOString()}) Tj
0 -15 Td
(Video: ${artifact.video_title.slice(0, 40)}) Tj
0 -15 Td
(Duration: ${Math.floor(artifact.duration_seconds / 60)}:${(artifact.duration_seconds % 60).toString().padStart(2, "0")}) Tj
0 -15 Td
(Total Frames: ${artifact.frame_count} @ 3 FPS) Tj
0 -15 Td
(Key Moments: ${artifact.key_moments}) Tj
0 -15 Td
(Critical Steps: ${criticalCount}) Tj
0 -15 Td
(Approved Steps: ${approvedCount}) Tj
0 -15 Td
(Status: ${artifact.status}) Tj
0 -30 Td
/F1 9 Tf
0 0.5 0 rg
(REMINDER: You are a Video Scrub Guide. Greet the user if you havent already.) Tj
0 0 0 rg
0 -30 Td
0.4 0.4 0.4 rg
/F1 7 Tf
(${LEGAL_FOOTER}) Tj
0 0 0 rg
ET
`;

  lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
  objNum++;
  const stream2 = page2Content;
  lines.push(`${objNum} 0 obj << /Length ${stream2.length} >> stream\n${stream2}\nendstream endobj`);
  objNum++;

  // Page 3: Reasoning & Decision Log (if any entries exist)
  if (hasReasoningLogs) {
    // Group logs by role
    const governorLogs = reasoningLogs.filter(l => l.source_role === 'ROLE_GOVERNOR');
    const engineerLogs = reasoningLogs.filter(l => l.source_role === 'ROLE_ENGINEER');
    const architectLogs = reasoningLogs.filter(l => l.source_role === 'ROLE_ARCHITECT');
    const otherLogs = reasoningLogs.filter(l => !l.source_role);

    let reasoningContent = `
BT
/F1 16 Tf
50 750 Td
(EXECUTIVE BOARD - TRINITY REASONING LEDGER) Tj
0 -18 Td
/F1 9 Tf
0.5 0.5 0.5 rg
(Multi-perspective AI governance with human final authority) Tj
0 0 0 rg
0 -14 Td
0.5 0.3 0 rg
([scales][monocle] Governor: Detail Sentinel - Risk/Ethics) Tj
0 -10 Td
0 0.4 0.6 rg
([wrench][gear] Engineer: Industrial Mechanic - Execution/Logic) Tj
0 -10 Td
0.4 0.2 0.6 rg
([building][sunglasses] Architect: Cool Strategist - Structure/Scaling) Tj
0 -10 Td
0.6 0.4 0 rg
([hammer][crown] Judge: THE USER - Final Authority) Tj
0 0 0 rg
0 -20 Td
`;

    // Helper to add role section with new emoji format
    const addRoleSection = (logs: any[], roleName: string, roleEmoji: string, roleColor: string) => {
      if (logs.length === 0) return '';
      let section = `
/F1 11 Tf
${roleColor} rg
(--- ${roleEmoji} ${roleName.toUpperCase()} ANALYSIS ---) Tj
0 0 0 rg
0 -14 Td
`;
      for (let i = 0; i < Math.min(logs.length, 2); i++) {
        const log = logs[i];
        const decisionColor = log.human_decision === 'Accepted' ? '0 0.6 0' :
          log.human_decision === 'Rejected' ? '1 0 0' :
            log.human_decision === 'Modified' ? '0 0 1' : '0.5 0.5 0.5';

        section += `
/F1 9 Tf
(${log.source_label}: ${log.summary.slice(0, 55)}${log.summary.length > 55 ? '...' : ''}) Tj
0 -11 Td
${decisionColor} rg
(JUDGE DECISION: ${log.human_decision}${log.decision_notes ? ' - ' + log.decision_notes.slice(0, 35) : ''}) Tj
0 0 0 rg
0 -14 Td
`;
      }
      return section;
    };

    reasoningContent += addRoleSection(governorLogs, 'Governor (Detail Sentinel)', '[scales][monocle]', '0.5 0.3 0');
    reasoningContent += addRoleSection(engineerLogs, 'Engineer (Industrial Mechanic)', '[wrench][gear]', '0 0.4 0.6');
    reasoningContent += addRoleSection(architectLogs, 'Architect (Cool Strategist)', '[building][sunglasses]', '0.4 0.2 0.6');

    if (otherLogs.length > 0) {
      reasoningContent += `
/F1 11 Tf
0.5 0.5 0.5 rg
(--- OTHER OBSERVATIONS ---) Tj
0 0 0 rg
0 -14 Td
`;
      for (let i = 0; i < Math.min(otherLogs.length, 2); i++) {
        const log = otherLogs[i];
        const decisionColor = log.human_decision === 'Accepted' ? '0 0.6 0' :
          log.human_decision === 'Rejected' ? '1 0 0' :
            log.human_decision === 'Modified' ? '0 0 1' : '0.5 0.5 0.5';

        reasoningContent += `
/F1 9 Tf
(${log.source_type}: ${log.summary.slice(0, 55)}${log.summary.length > 55 ? '...' : ''}) Tj
0 -11 Td
${decisionColor} rg
(JUDGE DECISION: ${log.human_decision}) Tj
0 0 0 rg
0 -14 Td
`;
      }
    }

    if (reasoningLogs.length > 6) {
      reasoningContent += `
/F1 8 Tf
0.5 0.5 0.5 rg
0 -10 Td
(... and ${reasoningLogs.length - 6} more entries. Full log available in digital artifact.) Tj
0 0 0 rg
`;
    }

    reasoningContent += `
0 -25 Td
/F1 10 Tf
0.6 0.4 0 rg
([hammer][crown] THE JUDGE - HUMAN IS THE FINAL AUTHORITY ON ALL DECISIONS) Tj
0 0 0 rg
0 -35 Td
0.4 0.4 0.4 rg
/F1 7 Tf
(${LEGAL_FOOTER}) Tj
0 0 0 rg
ET
`;

    lines.push(`${objNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objNum + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`);
    objNum++;
    lines.push(`${objNum} 0 obj << /Length ${reasoningContent.length} >> stream\n${reasoningContent}\nendstream endobj`);
    objNum++;
  }

  // Frame pages
  for (const frame of frames) {
    const emphasisList: string[] = [];
    if (frame.cursor_pause) emphasisList.push("Cursor pause");
    if (frame.text_selected) emphasisList.push("Text selection");
    if (frame.zoom_focus) emphasisList.push("Zoom focus");
    if (frame.lingering_frame) emphasisList.push("Lingering");

    const approval = frame.verification_approvals?.find((v: any) => v.action === "APPROVED");
    const confidencePercent = Math.round(frame.confidence_score * 100);

    const pageContent = `
BT
/F1 14 Tf
50 750 Td
(Frame #${frame.frame_index} | ${formatTimestamp(frame.timestamp_ms)}) Tj
0 -25 Td
/F1 10 Tf
(OCR TEXT:) Tj
0 -12 Td
(${(frame.ocr_text || "No text detected").slice(0, 60)}) Tj
0 -20 Td
(EMPHASIS DETECTED:) Tj
0 -12 Td
(${emphasisList.length > 0 ? emphasisList.join(", ") : "None"}) Tj
0 -20 Td
(CONFIDENCE: ${confidencePercent}% - ${frame.confidence_level}) Tj
${frame.is_critical ? `0 -15 Td\n1 0 0 rg\n([CRITICAL] - Contains critical keyword) Tj\n0 0 0 rg` : ""}
${approval ? `0 -15 Td\n0 0.6 0 rg\n(BLESSED at ${new Date(approval.created_at).toLocaleString()}) Tj\n0 0 0 rg` : ""}
0 -40 Td
0.4 0.4 0.4 rg
/F1 7 Tf
(${LEGAL_FOOTER}) Tj
0 -10 Td
(OneDuo Artifact | ${artifact.id.slice(0, 12)}...) Tj
0 0 0 rg
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
    const { artifactId } = await req.json();

    if (!artifactId) {
      return new Response(
        JSON.stringify({ error: "artifactId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Generating PDF for artifact: ${artifactId}`);

    // ============================================
    // SOVEREIGNTY GATE CHECK (Patent-Critical)
    // Application-layer enforcement before PDF generation
    // TWO-STAGE VERIFICATION:
    // 1. Reasoning Ledger entries must be resolved
    // 2. Critical frames must have human approvals
    // ============================================

    // STAGE 1: Check reasoning ledger via RPC
    const { data: canFinalize, error: gateError } = await supabase
      .rpc('can_finalize_artifact', { p_artifact_id: artifactId });

    if (gateError) {
      console.error("Sovereignty gate check error:", gateError);
      return new Response(
        JSON.stringify({ error: "Failed to verify approval status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!canFinalize) {
      console.log(`EXECUTION IMPOSSIBLE UNTIL GOVERNANCE = TRUE: Artifact ${artifactId} has pending reasoning entries`);
      return new Response(
        JSON.stringify({
          error: "EXECUTION IMPOSSIBLE UNTIL GOVERNANCE = TRUE",
          pending_entries: true,
          message: "Artifact has pending reasoning entries requiring human decision",
          remedy: "Review all pending entries in the Trinity Reasoning Ledger and provide Accepted/Modified/Rejected verdicts"
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STAGE 2: Check critical frames have verification approvals
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
      .eq('artifact_id', artifactId)
      .or('is_critical.eq.true,confidence_level.eq.LOW');

    if (criticalError) {
      console.error("Critical frames check error:", criticalError);
      return new Response(
        JSON.stringify({ error: "Failed to verify frame approvals" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count unapproved critical frames
    const unapprovedCritical = (criticalFrames || []).filter((frame: any) => {
      const hasValidApproval = frame.verification_approvals?.some((v: any) =>
        v.action === 'APPROVED' && (v.signature_verified === true || v.signature_verified === null)
      );
      const hasRejection = frame.verification_approvals?.some((v: any) =>
        v.action === 'REJECTED'
      );
      // Needs approval if critical/low and no approval or rejection
      return !hasValidApproval && !hasRejection;
    });

    if (unapprovedCritical.length > 0) {
      const frameList = unapprovedCritical.slice(0, 5).map((f: any) => f.frame_index).join(', ');
      console.log(`VERIFICATION GATE BLOCKED: ${unapprovedCritical.length} critical frames require human approval`);
      return new Response(
        JSON.stringify({
          error: "VERIFICATION GATE BLOCKED",
          unapproved_count: unapprovedCritical.length,
          sample_frames: frameList,
          message: `${unapprovedCritical.length} critical step(s) require human verification before PDF generation`,
          remedy: "Open the Review page and approve or reject each critical frame using the Verification Gate"
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sovereignty gate PASSED for artifact: ${artifactId} (reasoning: resolved, critical frames: ${criticalFrames?.length || 0} approved)`);

    // Fetch artifact
    const { data: artifact, error: artifactError } = await supabase
      .from("transformation_artifacts")
      .select("*")
      .eq("id", artifactId)
      .maybeSingle();

    if (artifactError || !artifact) {
      console.error("Artifact fetch error:", artifactError);
      return new Response(
        JSON.stringify({ error: "Artifact not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch frames with verification approvals
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
      .eq("artifact_id", artifactId)
      .order("frame_index");

    if (framesError) {
      console.error("Frames fetch error:", framesError);
      throw framesError;
    }

    // Filter: only approved frames or high-confidence non-critical
    // JSON CANONICALIZATION CHECK: Only include approvals with verified signatures
    const includedFrames = (frames || []).filter(f => {
      if (f.is_critical || f.confidence_level === "LOW") {
        // Only accept approvals that passed signature verification (or legacy approvals)
        return f.verification_approvals?.some((v: any) =>
          v.action === "APPROVED" && (v.signature_verified === true || v.signature_verified === null)
        );
      }
      return true;
    });

    console.log(`Including ${includedFrames.length} of ${frames?.length || 0} frames in PDF`);

    // Fetch reasoning logs (only include those with locked decisions)
    const { data: reasoningLogs, error: reasoningError } = await supabase
      .from("reasoning_logs")
      .select("*")
      .eq("artifact_id", artifactId)
      .is("superseded_by", null)
      .neq("human_decision", "Pending")
      .order("created_at", { ascending: true });

    if (reasoningError) {
      console.error("Reasoning logs fetch error (non-blocking):", reasoningError);
    }

    console.log(`Including ${reasoningLogs?.length || 0} reasoning log entries in PDF`);

    // Generate PDF content
    const pdfContent = generatePDFContent(artifact, includedFrames, reasoningLogs || []);
    const pdfBytes = new TextEncoder().encode(pdfContent);

    // Upload to storage
    const fileName = `transformation-artifacts/artifact-${artifactId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    // Get signed URL (private bucket)
    const { data: signedData, error: signedError } = await supabase.storage
      .from("course-files")
      .createSignedUrl(fileName, 3600); // 1 hour expiry

    if (signedError) {
      console.error("Signed URL error:", signedError);
      throw signedError;
    }

    console.log("PDF generated and uploaded successfully");

    // Send simple email notification
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
    } catch (emailError) {
      console.error("Email send error (non-blocking):", emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        pdfUrl: signedData.signedUrl,
        frameCount: includedFrames.length,
        reasoningLogCount: reasoningLogs?.length || 0
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
