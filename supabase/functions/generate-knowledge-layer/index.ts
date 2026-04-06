/**
 * generate-knowledge-layer
 *
 * Enhances the existing OneDuo artifact by prepending a structured
 * 21-section "thinking layer" to each course/module using Claude Sonnet 4.6.
 * Full transcript is passed (200K context window — no truncation needed).
 *
 * Called by video-queue-worker after PDF generation, or on-demand
 * from the Dashboard.
 *
 * INPUT  { courseId, moduleId? }
 * OUTPUT { success, knowledgeLayerStatus, markdownLength }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.36.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Model ────────────────────────────────────────────────────────────────────
// Claude Sonnet 4.6 — 200K context window, full transcript coverage.
const CLAUDE_MODEL = "claude-sonnet-4-6";

// Sonnet 4.6 has 200K context. A 1-hour video transcript is ~40K chars.
// Cap at 80K chars to cover up to ~2-hour videos while keeping latency within timeout.
const MAX_TRANSCRIPT_CHARS = 300_000;

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

/**
 * Sample a long transcript evenly: take equal slices from the start,
 * middle, and end so the AI has context for the full video duration,
 * not just the opening minutes.
 */
function sampleTranscriptEvenly(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const chunkSize = Math.floor(maxChars / 3);

  const start  = text.slice(0, chunkSize);
  const midPos = Math.floor(text.length / 2) - Math.floor(chunkSize / 2);
  const middle = text.slice(midPos, midPos + chunkSize);
  const end    = text.slice(text.length - chunkSize);

  return (
    start  + "\n\n[... middle of video ...]\n\n" +
    middle + "\n\n[... end of video ...]\n\n" +
    end
  );
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

// ── Film: visual frame analysis (Claude Haiku, 30 key frames) ────────────────

async function analyzeFilmFrames(
  anthropic: Anthropic,
  frameUrls: string[],
  videoDurationSeconds: number,
): Promise<string> {
  const MAX_FRAMES = 30;
  const sampled = frameUrls.length <= MAX_FRAMES
    ? frameUrls
    : Array.from({ length: MAX_FRAMES }, (_, i) =>
        frameUrls[Math.round(i * (frameUrls.length - 1) / (MAX_FRAMES - 1))]);

  const frameDuration = videoDurationSeconds / Math.max(frameUrls.length, 1);
  const results: string[] = [];
  const BATCH = 5;

  for (let i = 0; i < sampled.length; i += BATCH) {
    const batch = sampled.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (url, bi) => {
      const frameIdx = Math.round((i + bi) * (frameUrls.length - 1) / (sampled.length - 1));
      const timestamp = formatDuration(Math.round(frameIdx * frameDuration));
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 30000)));
        try {
          const resp = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 300,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "url", url } },
              { type: "text", text: `Analyze this film frame at timestamp ${timestamp}. Return ONLY a JSON object:
{"shot_type":"close-up|medium|wide|extreme close-up|overhead|POV","mood":"one word","subtext":"what this visual conveys beyond dialogue (1 sentence)","character_state":"visible character expression/posture (1 sentence or empty)","visual_symbol":"any recurring motif or symbol (1 sentence or empty)","lighting":"one word descriptor","pacing":"static|slow|dynamic"}` }
            ]}]
          });
          const text = resp.content[0].type === "text" ? resp.content[0].text : "";
          const clean = text.includes("```json") ? text.split("```json")[1].split("```")[0].trim()
            : text.includes("```") ? text.split("```")[1].split("```")[0].trim() : text.trim();
          const parsed = JSON.parse(clean);
          return `[${timestamp}] Shot: ${parsed.shot_type} | Mood: ${parsed.mood} | Lighting: ${parsed.lighting} | Pacing: ${parsed.pacing}\n  Subtext: ${parsed.subtext}${parsed.character_state ? `\n  Characters: ${parsed.character_state}` : ""}${parsed.visual_symbol ? `\n  Symbol: ${parsed.visual_symbol}` : ""}`;
        } catch (e) {
          const is429 = String(e).includes("429");
          if (!is429 || attempt === 3) return `[${timestamp}] [frame analysis unavailable]`;
        }
      }
      return `[${timestamp}] [frame analysis unavailable]`;
    }));
    results.push(...batchResults);
    console.log(`[KnowledgeLayer:Film] Analyzed ${Math.min(i + BATCH, sampled.length)}/${sampled.length} frames`);
  }

  return results.join("\n\n");
}

// ── Claude call ──────────────────────────────────────────────────────────────

async function callClaude(
  anthropic: Anthropic,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 60000);
      console.log(`[KnowledgeLayer] Rate limited — retrying in ${delay}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      return response.content[0].type === "text" ? response.content[0].text : "";
    } catch (err) {
      const is429 = String(err).includes("429") || String(err).includes("rate_limit");
      if (!is429 || attempt === 4) throw err;
    }
  }
  throw new Error("Claude call failed after 5 attempts");
}

// ── Extraction prompt (the 21-section spec — Knowledge + Reasoning Layer) ─────

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

--- TRANSCRIPT (evenly sampled: start / middle / end of full video) ---
${transcriptChunk}

---

Now produce the structured knowledge layer using EXACTLY these 21 sections:

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

## DECISION RULES
(Actionable if-then logic extracted from this module. Format each rule as:
  IF [situation or condition]
  → THEN [recommended action or decision]
  WHY: [one-sentence rationale]
Produce 5–10 decision rules. These turn knowledge into executable logic for AI reasoning.)

## REASONING PATTERNS
(The mental models and thinking strategies the speaker demonstrates — not just what they teach, but HOW they think.
Format each as:
  Pattern name: [name]
  Description: [how the speaker reasons through problems]
  Example from module: [specific moment where this is used]
Produce 3–7 patterns.)

## SPEAKER BELIEF SYSTEM
(The core assumptions, worldview, and operating principles the speaker holds — often implicit, not stated directly.
Format as bullet points:
  • [Belief] — [Evidence from the module])

## CAUSE & EFFECT CHAINS
(Explicit cause-and-effect logic the speaker teaches. Format each as:
  [Trigger/Cause] → [Action/Mechanism] → [Result/Effect]
  Context: [when this chain applies]
Produce 3–8 chains.)

## HIDDEN PATTERNS
(Insights NOT explicitly stated in the transcript — persuasion techniques, psychological principles, structural patterns.
Format each as:
  Pattern type: [persuasion | psychology | efficiency | strategy | structure]
  Observation: [what's happening beneath the surface]
  Why it matters: [implication for the learner])

## CONCEPT TAGS
(Structured tags for AI cross-referencing across multiple OneDuos. Format as:
  [concept] | [category: strategy | mindset | framework | tactic | principle | tool] | [strength: core | supporting | mentioned]
List 10–20 tags.)

## RETRIEVAL TAGS
(Flat comma-separated tag list for semantic retrieval)`;
}

// ── Film-specific prompts ─────────────────────────────────────────────────────

function buildFilmSystemPrompt(): string {
  return `You are a master screenwriter, film analyst, and story architect.

Your job is to create a structured Film OneDuo — a deep reasoning layer that allows an AI to fully "watch" and understand this film through its transcript and visual frame data, then use that understanding to write new screenplays, transpose stories into new contexts, or analyze narrative structure.

The output must be so detailed that an AI reading it could:
1. Reconstruct the emotional experience of watching the film
2. Identify the exact structural blueprint and replicate it in a new setting
3. Understand every character's psychology deeply enough to write them in a new context
4. Recognize visual and thematic motifs and transplant them symbolically

OUTPUT FORMAT: Structured Markdown using exact section headings below.
Be explicit, specific, and timestamp-anchored. Do NOT add meta-commentary — start directly with ## FILM TITLE.`;
}

function buildFilmUserPrompt(
  title: string,
  duration: string,
  transcriptChunk: string,
  visualAnalysis: string,
): string {
  return `FILM TITLE: ${title}
RUNTIME: ${duration}

--- VISUAL FRAME ANALYSIS (key scenes sampled across full runtime) ---
${visualAnalysis || "No visual frame data available."}

--- TRANSCRIPT (dialogue and narration with timestamps) ---
${transcriptChunk}

---

Produce the Film OneDuo using EXACTLY these sections:

## FILM TITLE
## RUNTIME
## GENRE & TONE
(Genre, subgenre, overall emotional tone, pacing style)

## LOGLINE
(One sentence: protagonist + goal + obstacle + stakes)

## EXECUTIVE SUMMARY
(8–12 bullets covering the full story arc from start to finish — include specific plot points and timestamps)

## THREE-ACT STRUCTURE
(For each act: timestamp range | what happens | dramatic purpose | emotional state of protagonist)

## BEAT SHEET
(Save the Cat beats mapped to timestamps:
  Beat name | Timestamp | What happens | Emotional shift)

## SCENE BREAKDOWN
(For each meaningful scene:
  Scene # | Timestamp | Location | Characters present | What happens | Dramatic purpose | Emotional beat | Subtext beneath the dialogue)

## CHARACTER ARCS
(For each major character:
  Name | Want (conscious goal) | Need (unconscious truth) | Flaw | Wound | Belief | Transformation | Key scene timestamps)

## RELATIONSHIP DYNAMICS
(For each major character pair:
  Characters | Starting dynamic | Turning points with timestamps | Final dynamic | Dramatic function)

## DIALOGUE SUBTEXT MAP
(5–10 key exchanges where what is said ≠ what is meant:
  Timestamp | What is said | What is actually meant | Why it matters dramatically)

## THEMATIC LAYER
(Core themes | How each is expressed visually and through dialogue | Timestamp examples)

## VISUAL SYMBOLS & MOTIFS
(Recurring visual elements and what they represent:
  Symbol | First appearance timestamp | Recurrences | Meaning | How it evolves)

## EMOTIONAL BEAT MAP
(Audience emotional journey — map the emotional state the film creates in the viewer:
  Timestamp range | Intended audience emotion | How it is created | Narrative device used)

## CINEMATIC LANGUAGE
(Key directorial/visual choices:
  Timestamp | Shot type | Why this choice | What it communicates beyond dialogue)

## CAUSE & EFFECT CHAINS
(The story's core logic:
  [Cause] → [Action] → [Effect] → [Consequence]
  Produce 5–8 chains that explain why the story unfolds as it does)

## HIDDEN PATTERNS
(What is operating beneath the surface — psychological, structural, symbolic:
  Pattern type | Observation | Timestamp evidence | Why it matters)

## BLUEPRINT FOR RECREATION
(A structural template an AI could follow to transpose this story into a new context:
  Step 1: [The setup — what elements must be established and why]
  Step 2: [The inciting incident — what type of disruption is needed]
  ...continue through all major structural moves...
  Key rules: [What must be preserved for the story to work in any context]
  What can be swapped: [Setting, profession, era, genre tone]
  What cannot be swapped: [Core emotional truth, character wound, thematic stakes])

## PROMPT STARTERS FOR AI
(10 specific prompts a screenwriter could use with this OneDuo:
  e.g. "Using the Whiplash OneDuo, write a scene where [X] but instead of drumming, the protagonist is...")

## RETRIEVAL TAGS
(Flat comma-separated tag list for semantic retrieval)`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId, moduleId, contentType = "course" } = await req.json();
    const isFilm = contentType === "film";
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = Deno.env.get("CLAUDE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anthropic = new Anthropic({ apiKey: claudeApiKey });

    // ── Fetch the target row ────────────────────────────────────────────────
    const table: "courses" | "course_modules" = moduleId ? "course_modules" : "courses";
    const { data: row, error: fetchErr } = moduleId
      ? await supabase.from("course_modules").select("*").eq("id", moduleId).eq("course_id", courseId).maybeSingle()
      : await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();

    if (fetchErr || !row) {
      return new Response(JSON.stringify({ error: "Record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Guard: skip if already complete or already generating ──────────────
    if (row.knowledge_layer_status === "complete") {
      return new Response(
        JSON.stringify({ success: true, message: "Already complete — skipped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (row.knowledge_layer_status === "generating") {
      return new Response(
        JSON.stringify({ success: true, message: "Already generating — skipped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mark as generating immediately ────────────────────────────────────
    await supabase
      .from(table)
      .update({ knowledge_layer_status: "generating" })
      .eq("id", moduleId || courseId);

    // ── Background work — no timeout, runs after response is sent ─────────
    const backgroundWork = async () => {
      try {
        const fps: number = row.fps_target || (row.density_mode === "precision" ? 3 : 1);
        const durationSec: number = row.video_duration_seconds || 0;
        const durationStr = formatDuration(durationSec);
        const moduleTitle: string = row.title || "Untitled Module";

        // Transcript
        let rawTranscript = buildTranscriptText(row.transcript);
        if (!rawTranscript && table === "courses") {
          const { data: firstMod } = await supabase
            .from("course_modules")
            .select("transcript, title, video_duration_seconds")
            .eq("course_id", courseId)
            .order("module_number")
            .limit(1)
            .maybeSingle();
          if (firstMod?.transcript) {
            rawTranscript = buildTranscriptText(firstMod.transcript);
            console.log(`[KnowledgeLayer] Used module transcript fallback for course ${courseId}`);
          }
        }
        const transcriptChunk = sampleTranscriptEvenly(rawTranscript, MAX_TRANSCRIPT_CHARS);

        if (!transcriptChunk) {
          console.warn(`[KnowledgeLayer] No transcript found for ${table}:${moduleId || courseId}`);
        }

        let systemPrompt: string;
        let userPrompt: string;

        if (isFilm) {
          // ── FILM MODE: visual frame analysis + film-specific prompt ────────
          const frameUrls: string[] = row.frame_urls || [];
          console.log(`[KnowledgeLayer:Film] Analyzing ${Math.min(frameUrls.length, 30)} key frames visually...`);
          const visualAnalysis = frameUrls.length > 0
            ? await analyzeFilmFrames(anthropic, frameUrls, durationSec)
            : "No frame data available.";

          // Store visual frame analyses in DB for PDF generation to use
          if (frameUrls.length > 0) {
            await supabase.from(table).update({ frame_analyses: { film_visual: visualAnalysis } }).eq("id", moduleId || courseId);
          }

          systemPrompt = buildFilmSystemPrompt();
          userPrompt = buildFilmUserPrompt(moduleTitle, durationStr, transcriptChunk, visualAnalysis);
          console.log(`[KnowledgeLayer:Film] Calling Claude Sonnet 4.6 for film OneDuo...`);
        } else {
          // ── COURSE MODE: existing flow ─────────────────────────────────────
          let frameSummary = "";
          if (row.frame_urls && Array.isArray(row.frame_urls) && row.frame_urls.length > 0) {
            const fakFrames = (row.frame_urls as string[]).map((_, idx) => ({ frame_index: idx, ocr_text: "" }));
            frameSummary = buildFrameSummary(fakFrames, fps);
          }
          const { data: afRows } = await supabase
            .from("artifact_frames")
            .select("frame_index, ocr_text, timestamp_ms")
            .eq("artifact_id", moduleId || courseId)
            .order("frame_index")
            .limit(500);
          if (afRows && afRows.length > 0) {
            frameSummary = buildFrameSummary(afRows, fps);
          }

          systemPrompt = buildSystemPrompt(fps);
          userPrompt = buildUserPrompt(moduleTitle, durationStr, transcriptChunk, frameSummary, fps);
          console.log(`[KnowledgeLayer] Calling Claude Sonnet 4.6 for ${table}:${moduleId || courseId} (background)`);
        }

        const rawMarkdown = await callClaude(anthropic, systemPrompt, userPrompt);

        if (!rawMarkdown || rawMarkdown.trim().length < 100) {
          throw new Error("Claude returned empty or too-short output");
        }

        // ── Parse and persist ──────────────────────────────────────────────
        const knowledgeLayer = parseMarkdownToJson(rawMarkdown, moduleTitle, durationStr);
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
        console.log(`[KnowledgeLayer] Complete for ${table}:${moduleId || courseId} — ${rawMarkdown.length} chars`);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[KnowledgeLayer] Background error:", msg);
        await supabase
          .from(table)
          .update({ knowledge_layer_status: "failed", knowledge_layer_error: msg })
          .eq("id", moduleId || courseId);
      }
    };

    // ── Respond immediately, run generation in background ─────────────────
    EdgeRuntime.waitUntil(backgroundWork());

    return new Response(
      JSON.stringify({ success: true, message: "Knowledge layer generation started" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[KnowledgeLayer] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Markdown → JSONB parser ───────────────────────────────────────────────────
// Splits the Claude output into named sections for structured storage.

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
    "DECISION RULES",
    "REASONING PATTERNS",
    "SPEAKER BELIEF SYSTEM",
    "CAUSE & EFFECT CHAINS",
    "HIDDEN PATTERNS",
    "CONCEPT TAGS",
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
    decision_rules: sections["DECISION RULES"] || "",
    reasoning_patterns: sections["REASONING PATTERNS"] || "",
    speaker_belief_system: sections["SPEAKER BELIEF SYSTEM"] || "",
    cause_effect_chains: sections["CAUSE & EFFECT CHAINS"] || "",
    hidden_patterns: sections["HIDDEN PATTERNS"] || "",
    concept_tags: sections["CONCEPT TAGS"] || "",
    retrieval_tags: tags,
    full_transcript: sections["FULL CLEANED TRANSCRIPT"] || "",
    generated_at: new Date().toISOString(),
  };
}
