/**
 * generate-knowledge-layer
 *
 * Enhances the existing OneDuo artifact by prepending a structured
 * 17-section "thinking layer" to each course/module using Replicate
 * (meta/meta-llama-3-70b-instruct, 8k ctx per chunk).
 *
 * Called by video-queue-worker after PDF generation, or on-demand
 * from the Dashboard.
 *
 * INPUT  { courseId, moduleId? }
 * OUTPUT { success, knowledgeLayerStatus, markdownLength }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Model ────────────────────────────────────────────────────────────────────
// meta/meta-llama-3-70b-instruct on Replicate.
// Max output tokens kept at 4096 to stay within Supabase edge fn limits.
const REPLICATE_MODEL = "meta/meta-llama-3-70b-instruct";

// Transcript is chunked so each call stays well under the model's 8k ctx.
const MAX_TRANSCRIPT_CHARS = 12_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function buildTranscriptText(transcript: any): string {
  if (!transcript) return "";
  if (typeof transcript === "string") return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map((seg: any) => {
        const ts = seg.start !== undefined ? `[${formatDuration(seg.start)}] ` : "";
        const sp = seg.speaker ? `${seg.speaker}: ` : "";
        return `${ts}${sp}${seg.text || ""}`;
      })
      .join("\n");
  }
  return JSON.stringify(transcript);
}

function buildFrameSummary(frames: any[], fps: number): string {
  if (!frames || frames.length === 0) return "No visual frame data available.";

  // For 3 FPS collapse runs of identical OCR text (redundant frames).
  const segments: string[] = [];
  let prev = "";
  let count = 0;

  for (const f of frames) {
    const text = (f.ocr_text || "").trim();
    if (text === prev) {
      count++;
    } else {
      if (prev) {
        const ts = formatDuration(Math.round((f.frame_index - count) / fps));
        segments.push(`[${ts}] ${prev}${count > 1 ? ` (×${count})` : ""}`);
      }
      prev = text;
      count = 1;
    }
  }
  if (prev) {
    segments.push(prev);
  }

  // Cap to keep prompt size manageable
  return segments.slice(0, 300).join("\n");
}

// ── Replicate call ────────────────────────────────────────────────────────────

async function callReplicate(
  replicate: Replicate,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const output = await replicate.run(REPLICATE_MODEL, {
    input: {
      system_prompt: systemPrompt,
      prompt: userPrompt,
      max_tokens: 4096,
      temperature: 0.2,
      top_p: 0.9,
    },
  });

  // Replicate text models return string[] — join into one string
  if (Array.isArray(output)) return output.join("");
  return String(output ?? "");
}

// ── Extraction prompt (the 17-section spec from the client brief) ─────────────

function buildSystemPrompt(fps: number): string {
  return `You are enhancing the existing OneDuo artifact pipeline.

IMPORTANT PRODUCT CONTEXT:
We are NOT creating a new product.
We are enhancing the CURRENT OneDuo artifact so it becomes more useful as an AI-readable thinking layer.

The existing product already outputs:
1. A full verbatim transcript
2. Visual frame captures from the video (${fps} FPS)
3. Timestamps and module/chapter organisation
4. A merged PDF artifact for prompting with AI

Your job is to ADD a structured knowledge layer on top of the existing artifact output.

VISUAL INPUT RULE:
The visual frame capture rate is ${fps} FPS.
${fps >= 3
  ? "- Compress repetitive adjacent frames aggressively into segments.\n- Consolidate near-identical consecutive frames into one visual observation."
  : "- Treat visuals as sampled snapshots rather than continuous motion.\n- Do not overclaim motion or transitions."}
- Highlight only visually meaningful changes, not redundant frame noise.

OUTPUT FORMAT:
Produce structured Markdown using the exact section headings below.
Be explicit, literal, and concise. Optimise for future AI prompting and retrieval.
Do NOT add meta-commentary or preamble — start directly with ## MODULE TITLE.`;
}

function buildUserPrompt(
  moduleTitle: string,
  duration: string,
  transcriptChunk: string,
  frameSummary: string,
  fps: number
): string {
  return `MODULE TITLE: ${moduleTitle}
DURATION: ${duration}
FRAME RATE: ${fps} FPS

--- VISUAL FRAME SUMMARY ---
${frameSummary}

--- TRANSCRIPT (excerpt) ---
${transcriptChunk}

---

Now produce the structured knowledge layer using EXACTLY these 15 sections:

## MODULE TITLE
## DURATION
## PRIMARY TOPIC
## OUTCOME

## EXECUTIVE SUMMARY
(5–10 bullets summarising what is actually taught)

## CORE CONCEPTS
(For each concept: Concept name | Definition | Why it matters | Keywords/synonyms)

## FRAMEWORKS / MODELS
(For each framework: Name | Steps/components | Problem it solves | Inputs | Outputs)

## VISUAL SEGMENTS
(Consolidated — NOT frame-by-frame. For each meaningful visual segment:
  Timestamp range | Visual type | What appears | Added meaning beyond transcript)

## KEY CLAIMS / THESIS
(Main assertions or beliefs presented)

## QUESTIONS THIS MODULE ANSWERS
(10–20 natural-language questions a user might ask an AI about this module)

## ACTIONABLE TAKEAWAYS
(Practical rules, actions, decisions, or next steps)

## CROSS-MODULE LINK OPPORTUNITIES
(Concepts likely to connect to other lessons)

## IMPORTANT QUOTES
(Short memorable quotes with timestamps)

## PROMPT STARTERS FOR AI
(Useful prompts a user could ask based on this module)

## RETRIEVAL TAGS
(Flat comma-separated tag list for semantic retrieval)

## FULL CLEANED TRANSCRIPT
(Preserve all timestamps. Lightly clean only obvious OCR/transcription errors.
 Do NOT rewrite the speaker's meaning.)`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId, moduleId } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const replicate = new Replicate({ auth: replicateToken });

    // ── Fetch the target row ────────────────────────────────────────────────
    let row: any = null;
    let table: "courses" | "course_modules" = "courses";

    if (moduleId) {
      table = "course_modules";
      const { data, error } = await supabase
        .from("course_modules")
        .select("*")
        .eq("id", moduleId)
        .eq("course_id", courseId)
        .maybeSingle();
      if (error || !data) throw new Error(`Module not found: ${moduleId}`);
      row = data;
    } else {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .maybeSingle();
      if (error || !data) throw new Error(`Course not found: ${courseId}`);
      row = data;
    }

    // ── Guard: skip if already complete ────────────────────────────────────
    if (row.knowledge_layer_status === "complete") {
      return new Response(
        JSON.stringify({ success: true, message: "Already complete — skipped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mark as generating ─────────────────────────────────────────────────
    await supabase
      .from(table)
      .update({ knowledge_layer_status: "generating" })
      .eq("id", moduleId || courseId);

    // ── Build inputs ───────────────────────────────────────────────────────
    const fps: number = row.fps_target || (row.density_mode === "precision" ? 3 : 1);
    const durationSec: number = row.video_duration_seconds || 0;
    const durationStr = formatDuration(durationSec);
    const moduleTitle: string = row.title || "Untitled Module";

    // Transcript
    const rawTranscript = buildTranscriptText(row.transcript);
    const transcriptChunk = rawTranscript.slice(0, MAX_TRANSCRIPT_CHARS);

    // Frames — pull from artifact_frames if available, else use frame_urls OCR
    let frameSummary = "";
    if (row.frame_urls && Array.isArray(row.frame_urls) && row.frame_urls.length > 0) {
      // Build lightweight frame objects from stored urls with index
      const fakFrames = (row.frame_urls as string[]).map((_, idx) => ({
        frame_index: idx,
        ocr_text: "",
      }));
      frameSummary = buildFrameSummary(fakFrames, fps);
    }

    // If we have artifact_frames with real OCR, prefer those
    const { data: afRows } = await supabase
      .from("artifact_frames")
      .select("frame_index, ocr_text, timestamp_ms")
      .eq("artifact_id", moduleId || courseId)
      .order("frame_index")
      .limit(500);

    if (afRows && afRows.length > 0) {
      const fpsForFrames = fps;
      frameSummary = buildFrameSummary(afRows, fpsForFrames);
    }

    // ── Call Replicate ─────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(fps);
    const userPrompt = buildUserPrompt(
      moduleTitle,
      durationStr,
      transcriptChunk,
      frameSummary,
      fps
    );

    console.log(`[KnowledgeLayer] Calling Replicate for ${table}:${moduleId || courseId}`);
    const rawMarkdown = await callReplicate(replicate, systemPrompt, userPrompt);

    if (!rawMarkdown || rawMarkdown.trim().length < 100) {
      throw new Error("Replicate returned empty or too-short output");
    }

    // ── Parse the markdown into a structured JSONB object ──────────────────
    const knowledgeLayer = parseMarkdownToJson(rawMarkdown, moduleTitle, durationStr);

    // ── Persist ────────────────────────────────────────────────────────────
    const { error: saveErr } = await supabase
      .from(table)
      .update({
        knowledge_layer: knowledgeLayer,
        knowledge_layer_txt: rawMarkdown,
        knowledge_layer_status: "complete",
        knowledge_layer_error: null,
      })
      .eq("id", moduleId || courseId);

    if (saveErr) throw new Error(`DB save failed: ${saveErr.message}`);

    console.log(
      `[KnowledgeLayer] Complete for ${table}:${moduleId || courseId} — ${rawMarkdown.length} chars`
    );

    return new Response(
      JSON.stringify({
        success: true,
        knowledgeLayerStatus: "complete",
        markdownLength: rawMarkdown.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[KnowledgeLayer] Error:", msg);

    // Try to mark as failed so the dashboard can surface it
    try {
      const { courseId, moduleId } = await req.clone().json().catch(() => ({} as any));
      if (courseId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const table = moduleId ? "course_modules" : "courses";
        await supabase
          .from(table)
          .update({ knowledge_layer_status: "failed", knowledge_layer_error: msg })
          .eq("id", moduleId || courseId);
      }
    } catch (_) { /* best-effort */ }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Markdown → JSONB parser ───────────────────────────────────────────────────
// Splits the Replicate output into named sections for structured storage.

function parseMarkdownToJson(md: string, title: string, duration: string): Record<string, any> {
  const sections: Record<string, string> = {};

  // Section headers we expect (in order)
  const SECTION_NAMES = [
    "MODULE TITLE",
    "DURATION",
    "PRIMARY TOPIC",
    "OUTCOME",
    "EXECUTIVE SUMMARY",
    "CORE CONCEPTS",
    "FRAMEWORKS / MODELS",
    "VISUAL SEGMENTS",
    "KEY CLAIMS / THESIS",
    "QUESTIONS THIS MODULE ANSWERS",
    "ACTIONABLE TAKEAWAYS",
    "CROSS-MODULE LINK OPPORTUNITIES",
    "IMPORTANT QUOTES",
    "PROMPT STARTERS FOR AI",
    "RETRIEVAL TAGS",
    "FULL CLEANED TRANSCRIPT",
  ];

  // Split on ## headings
  const parts = md.split(/^##\s+/m);

  for (const part of parts) {
    const firstLine = part.split("\n")[0].trim().toUpperCase();
    const body = part.split("\n").slice(1).join("\n").trim();
    const matched = SECTION_NAMES.find((s) => firstLine.startsWith(s));
    if (matched) {
      sections[matched] = body;
    }
  }

  // Ensure basics are always populated
  if (!sections["MODULE TITLE"]) sections["MODULE TITLE"] = title;
  if (!sections["DURATION"]) sections["DURATION"] = duration;

  // Parse RETRIEVAL TAGS into an array
  const tags = sections["RETRIEVAL TAGS"]
    ? sections["RETRIEVAL TAGS"]
        .split(/[,\n]/)
        .map((t) => t.replace(/^[-*•\s]+/, "").trim())
        .filter(Boolean)
    : [];

  return {
    module_title: sections["MODULE TITLE"] || title,
    duration: sections["DURATION"] || duration,
    primary_topic: sections["PRIMARY TOPIC"] || "",
    outcome: sections["OUTCOME"] || "",
    executive_summary: sections["EXECUTIVE SUMMARY"] || "",
    core_concepts: sections["CORE CONCEPTS"] || "",
    frameworks: sections["FRAMEWORKS / MODELS"] || "",
    visual_segments: sections["VISUAL SEGMENTS"] || "",
    key_claims: sections["KEY CLAIMS / THESIS"] || "",
    questions: sections["QUESTIONS THIS MODULE ANSWERS"] || "",
    actionable_takeaways: sections["ACTIONABLE TAKEAWAYS"] || "",
    cross_module_links: sections["CROSS-MODULE LINK OPPORTUNITIES"] || "",
    important_quotes: sections["IMPORTANT QUOTES"] || "",
    prompt_starters: sections["PROMPT STARTERS FOR AI"] || "",
    retrieval_tags: tags,
    full_transcript: sections["FULL CLEANED TRANSCRIPT"] || "",
    generated_at: new Date().toISOString(),
  };
}
