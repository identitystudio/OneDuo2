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

// ── Audio energy timeline ─────────────────────────────────────────────────────
// Builds a structured audio narrative map from:
// 1. Transcript gap analysis  — silence > 8s = music/action sequence
// 2. AssemblyAI chapters      — emotional summaries per chapter
// 3. AssemblyAI sentiment     — speech emotional polarity over time
//
// This captures what raw waveform analysis would show: where the music dominates,
// where emotional peaks are, and the build/climax/resolution shape of the film.

function buildAudioEnergyTimeline(
  transcript: Array<{ start: number; end?: number; text: string }>,
  chapters: Array<{ start: number; end: number; headline: string; summary: string; gist?: string }>,
  sentiment: Array<{ start: number; end?: number; text: string; sentiment: string; confidence: number }>,
  videoDuration: number
): string {
  if (!transcript || transcript.length === 0) return "";

  const lines: string[] = ["=== AUDIO NARRATIVE ENERGY MAP ===", ""];

  // ── 1. Chapter-level arc (broadest view) ───────────────────────────────────
  if (chapters && chapters.length > 0) {
    lines.push("CHAPTER ARC:");
    for (const ch of chapters) {
      lines.push(`  [${formatDuration(ch.start)} → ${formatDuration(ch.end)}] ${ch.headline}`);
      if (ch.summary) lines.push(`    Summary: ${ch.summary}`);
      if (ch.gist) lines.push(`    Gist: ${ch.gist}`);
    }
    lines.push("");
  }

  // ── 2. Transcript gap analysis (finds music/action sequences) ─────────────
  lines.push("SPEECH vs NON-SPEECH TIMELINE:");
  const sorted = [...transcript].sort((a, b) => a.start - b.start);
  let lastEnd = 0;
  let nonSpeechCount = 0;

  for (const seg of sorted) {
    const gap = seg.start - lastEnd;
    if (gap > 8) {
      nonSpeechCount++;
      const label = gap > 120 ? "MAJOR SEQUENCE" : gap > 30 ? "SUSTAINED" : "BRIEF";
      lines.push(
        `  [${formatDuration(lastEnd)} → ${formatDuration(seg.start)}] ` +
        `NON-SPEECH ${label} (${Math.round(gap)}s) — music/action/atmosphere`
      );
    }
    if (seg.text) {
      // Attach sentiment if available for this segment
      const sentimentMatch = sentiment.find(s =>
        Math.abs(s.start - seg.start) < 5
      );
      const sentimentTag = sentimentMatch
        ? ` [${sentimentMatch.sentiment} ${Math.round(sentimentMatch.confidence * 100)}%]`
        : "";
      lines.push(
        `  [${formatDuration(seg.start)}]${sentimentTag} "${seg.text.substring(0, 100)}${seg.text.length > 100 ? "..." : ""}"`
      );
    }
    lastEnd = seg.end ?? seg.start + 5;
  }

  // Final non-speech segment
  if (videoDuration - lastEnd > 8) {
    const gap = videoDuration - lastEnd;
    const label = gap > 120 ? "MAJOR SEQUENCE" : gap > 30 ? "SUSTAINED" : "BRIEF";
    lines.push(
      `  [${formatDuration(lastEnd)} → ${formatDuration(videoDuration)}] ` +
      `NON-SPEECH ${label} (${Math.round(gap)}s) — music/action/atmosphere`
    );
    nonSpeechCount++;
  }

  lines.push("");
  lines.push(`Total non-speech sequences: ${nonSpeechCount}`);

  // ── 3. Sentiment arc summary (emotional polarity of speech) ───────────────
  if (sentiment && sentiment.length > 0) {
    const pos = sentiment.filter(s => s.sentiment === "POSITIVE").length;
    const neg = sentiment.filter(s => s.sentiment === "NEGATIVE").length;
    const neu = sentiment.filter(s => s.sentiment === "NEUTRAL").length;
    lines.push("");
    lines.push(`SPEECH SENTIMENT BREAKDOWN: ${pos} positive / ${neu} neutral / ${neg} negative`);

    // Find peak negative moments (likely climax/conflict scenes)
    const peakNeg = sentiment
      .filter(s => s.sentiment === "NEGATIVE" && s.confidence > 0.85)
      .slice(0, 5);
    if (peakNeg.length > 0) {
      lines.push("Peak negative (high-conflict/climax) moments:");
      for (const p of peakNeg) {
        lines.push(`  [${formatDuration(p.start)}] "${p.text.substring(0, 80)}..." (confidence: ${Math.round(p.confidence * 100)}%)`);
      }
    }
  }

  return lines.join("\n");
}

// ── Frame sampling helper ─────────────────────────────────────────────────────

function sampleFramesEvenly(frames: string[], maxFrames: number): string[] {
  if (!Array.isArray(frames) || frames.length === 0) return [];
  if (frames.length <= maxFrames) return frames;
  const step = frames.length / maxFrames;
  const sampled: string[] = [];
  for (let i = 0; i < maxFrames; i++) {
    sampled.push(frames[Math.floor(i * step)]);
  }
  return sampled;
}

// ── Film visual analysis — Claude vision pass on sampled keyframes ────────────
// Runs before the knowledge layer prompt so visual descriptions enrich the output.
// Samples ~1 frame per minute (max 60) and asks Claude to describe each frame.

async function buildFilmVisualDescriptions(
  anthropic: Anthropic,
  frameUrls: string[],
  videoDuration: number
): Promise<string> {
  if (!frameUrls || frameUrls.length === 0) return "";

  // 1 frame per minute, capped at 60 total
  const targetSamples = Math.min(60, Math.max(12, Math.floor(videoDuration / 60)));
  const sampled = sampleFramesEvenly(frameUrls, targetSamples);
  const frameDuration = videoDuration / Math.max(frameUrls.length, 1);
  const BATCH_SIZE = 5;
  const descriptions: string[] = [];

  console.log(`[KnowledgeLayer] Film vision pass: ${sampled.length} frames (${targetSamples} target)`);

  for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
    const batch = sampled.slice(i, i + BATCH_SIZE);

    // Build multi-image message for this batch
    const content: any[] = [];
    batch.forEach((url, batchIdx) => {
      const originalIdx = Math.floor((i + batchIdx) * (frameUrls.length / sampled.length));
      const timestamp = formatDuration(Math.round(originalIdx * frameDuration));
      content.push({ type: "text", text: `[${timestamp}]` });
      content.push({ type: "image", source: { type: "url", url } });
    });
    content.push({
      type: "text",
      text: `For each frame above (identified by its timestamp label), write a concise visual description covering:
- Characters present and their expressions/body language
- What action or moment is happening
- Camera angle and distance (close-up, wide, over-shoulder, etc.)
- Visual mood, lighting, colour tone
- Any significant objects, symbols, or visual motifs

Format each as: [timestamp]: [description]
Be specific and analytical — this feeds directly into a screenplay analysis system.`
    });

    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      });
      if (response.content[0]?.type === "text") {
        descriptions.push(response.content[0].text);
      }
      console.log(`[KnowledgeLayer] Vision batch ${Math.floor(i / BATCH_SIZE) + 1} complete`);
    } catch (e) {
      console.warn(`[KnowledgeLayer] Vision batch ${Math.floor(i / BATCH_SIZE) + 1} failed (non-blocking):`, e);
    }
  }

  return descriptions.join("\n\n");
}

// ── Film-mode prompts ─────────────────────────────────────────────────────────

function buildFilmSystemPrompt(): string {
  return `You are building a OneDuo Story Intelligence Layer — the ultimate AI reasoning artifact for a film or TV show.

PRODUCT CONTEXT:
This artifact will be uploaded to AI tools (Claude, ChatGPT, etc.) so that the AI can:
- "Watch" the film and understand it at a structural, thematic, and character level
- Write screenplay adaptations (e.g. "Whiplash but for a ballet dancer")
- Analyse story structure against frameworks like Save the Cat, Story by McKee, Hero's Journey
- Swap the domain/setting while preserving the soul of the story

Your job is to produce a structured story intelligence layer that gives AI everything it needs to reason about this film at the level a professional screenwriter would.

CRITICAL PRINCIPLE — DOMAIN SUBSTITUTION:
For every structural element, explicitly tag what is SUBSTITUTABLE (setting, skill, profession) vs NON-SUBSTITUTABLE (theme, emotional arc, power dynamic). This is what enables AI to write "Whiplash but for ballet" — it knows the drumming is costume, the obsession and abuse dynamic is the soul.

OUTPUT FORMAT:
Produce structured Markdown using the exact section headings below.
Be explicit, literal, and deeply analytical. Optimise for AI reasoning and screenplay adaptation.
Do NOT add meta-commentary or preamble — start directly with ## TITLE.`;
}

function buildFilmUserPrompt(
  title: string,
  duration: string,
  transcriptChunk: string,
  frameSummary: string,
  supplementalContent: string,
  energyTimeline?: string
): string {
  return `TITLE: ${title}
DURATION: ${duration}

--- VISUAL FRAME SUMMARY ---
${frameSummary}

--- DIALOGUE / TRANSCRIPT ---
${transcriptChunk}

${energyTimeline ? `--- AUDIO NARRATIVE ENERGY MAP ---\n${energyTimeline}\n` : ''}
${supplementalContent ? `--- SUPPLEMENTAL STORY STRUCTURE REFERENCE ---\n${supplementalContent}\n` : ''}
---

Produce the OneDuo Story Intelligence Layer using EXACTLY these sections:

## TITLE
## DURATION
## GENRE & TONE
(Genre(s), primary tone, and how the tone shifts across the three acts)

## LOGLINE
(One sentence: protagonist + want + obstacle + stakes)

## THEMATIC DNA
(The non-substitutable soul of the story)
- Core theme: [the argument the film is making]
- Thematic question: [what is unresolved at the start]
- Thematic answer: [how the ending resolves or refuses to resolve it]
- Motifs: [recurring images, sounds, objects and what they symbolise]
- What makes this story IRREPLACEABLE: [why this story works and what cannot be swapped]

## STORY STRUCTURE
(Precise timestamps + descriptions for each structural beat)
- Setup:
- Inciting Incident: [timestamp]
- Plot Point 1 / End of Act 1: [timestamp]
- Midpoint: [timestamp]
- Plot Point 2 / End of Act 2: [timestamp]
- Dark Night of the Soul: [timestamp]
- Climax: [timestamp]
- Resolution: [timestamp]

## CHARACTER PROFILES
(For each major character, format as:)
Character: [name]
Role: [protagonist | antagonist | mentor | foil | love interest | ally]
Outer Want: [what they are consciously pursuing]
Inner Need: [what they actually need to grow/heal]
Wound: [the backstory wound driving their behaviour]
Fatal Flaw: [what holds them back]
Arc Type: [transformation | disillusionment | flat | corruption]
Arc Start: [psychological state at opening]
Arc End: [psychological state at closing]
Substitutability: [what about this character is domain-specific vs archetypal]

## PROTAGONIST TRANSFORMATION ARC
(Standalone detailed arc object)
- Opening state: [who they are, what they believe]
- Inciting disruption: [what breaks their world open]
- Escalation sequence: [3-5 key beats that push the transformation]
- Darkest moment: [when all seems lost and why]
- Choice point: [the moment of decision that defines the ending]
- Closing state: [who they are now, what changed]
- Transformation type: [what kind of change — redemption, corruption, acceptance, disillusionment]

## ANTAGONIST FUNCTION
- Name/role:
- What they represent thematically:
- How they mirror or oppose the protagonist:
- Their function in the story engine: [obstacle | mirror | tempter | dark version of hero]
- Substitutability: [is the antagonist archetype or domain-specific]

## POWER DYNAMICS
(A timeline of who holds power and when it shifts — this is the story engine)
Format each shift as: [timestamp] [who gains power] → [how] → [effect on protagonist]
End with: Overall power pattern: [e.g. "progressive subjugation followed by single reversal"]

## SCENE-BY-SCENE BREAKDOWN
(For each significant scene — consolidate minor scenes)
Format: [timestamp] SCENE: [description] | PURPOSE: [setup/escalation/reversal/climax/relief] | WINNER: [protagonist/antagonist/neither] | WHAT CHANGES: [what is different after this scene]

## WORLD-BUILDING & DOMAIN LAYER
- World rules: [the specific laws and culture of this world]
- World pressure: [what this specific setting uniquely creates as conflict]
- Domain elements:
  SUBSTITUTABLE: [list elements that are setting/costume — can be swapped in adaptation]
  NON-SUBSTITUTABLE: [list elements that are structural/thematic — must be preserved]
- Domain substitution hooks:
  [DOMAIN: X] → can be replaced with [any similar high-pressure environment]
  [SKILL: X] → can be replaced with [any virtuoso discipline requiring similar sacrifice]
  [INSTITUTION: X] → can be replaced with [any institution with similar power structure]
  (Add as many hooks as needed for complete adaptation guidance)

## SUBPLOT & B-STORY STRUCTURE
- B-story description: [what the secondary storyline is]
- B-story function: [how it mirrors, contrasts, or complicates the A-story theme]
- Intersection points: [timestamps where A and B stories collide and what that reveals]

## TONE MAP
(How the emotional register shifts act by act)
- Act 1 tone: [e.g. aspirational, grounded, hopeful]
- Act 2a tone: [e.g. escalating pressure, paranoia]
- Act 2b tone: [e.g. claustrophobic, desperate]
- Act 3 tone: [e.g. triumphant but hollow, bittersweet]
- Dominant colour palette / visual language: [what the frames reveal]

## SIGNATURE SET PIECES
(The 3-5 scenes that define the film's identity)
For each:
- Scene: [description + timestamp]
- What happens technically:
- Why it works emotionally:
- Structural function: [what job this scene does in the story]
- Substitutability: [can this scene type be transplanted to an adaptation]

## DIALOGUE STYLE PROFILE
- How characters speak: [direct/oblique, formal/raw, subtext-heavy/explicit]
- Subtext patterns: [what characters say vs. what they mean]
- Signature verbal patterns: [recurring phrases, rhythms, or speech styles]
- Silence and pause usage: [how non-dialogue moments carry meaning]

## EMOTIONAL ARCHITECTURE
(The emotional journey the audience is taken on)
- Emotional anchors: [3-5 peak moments of emotional intensity with timestamps and why they hit]
- Emotional contract with audience: [what the film promises emotionally and whether it delivers]
- Catharsis mechanism: [how the film releases emotional tension]

## AUDIO ENERGY TIMELINE
(Using the Audio Narrative Energy Map provided, interpret the music/silence/speech pattern for screenplay analysis)
- Key non-speech sequences: [list each major music/action sequence with timestamp and emotional function — e.g. "builds dread", "cathartic release", "tense escalation"]
- Emotional arc via speech sentiment: [how the positive/negative sentiment distribution maps to the story arc]
- Score-dependent moments: [scenes where music IS the storytelling — what this means for adaptation]
- Silence as storytelling: [moments where absence of speech carries dramatic weight]

## ADAPTATION BLUEPRINT
(Direct instructions for AI to use when adapting this story)
1. PRESERVE (non-negotiable structural elements):
   [List 5-8 things any adaptation must keep]
2. SUBSTITUTE (domain-specific elements that can be swapped):
   [List 5-8 things that can be replaced without breaking the story]
3. AVOID (common adaptation mistakes for this story type):
   [List 3-5 pitfalls]
4. Sample substitution: "This film but for [X profession/world]" — what changes, what stays

## RETRIEVAL TAGS
(Flat comma-separated tag list for semantic retrieval and cross-OneDuo reasoning)`;
}

// ── Training-mode prompts (the 21-section spec — Knowledge + Reasoning Layer) ──

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

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId, moduleId, contentType: incomingContentType } = await req.json();
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

    // ── Resolve content type: prefer what caller passed, fall back to DB row ─
    const isFilm = (incomingContentType || row.content_type || 'course') === 'film';

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

        // Frames
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

        // ── Load supplemental files (story structure books, reference docs) ─
        // These are uploaded alongside the video and stored in course_files.
        // For film mode, this is where story structure books (Save the Cat, etc.) live.
        let supplementalContent = "";
        const courseFiles = row.course_files as Array<{ name: string; storagePath: string; size?: number }> | null;
        if (courseFiles && Array.isArray(courseFiles) && courseFiles.length > 0) {
          const parts: string[] = [];
          for (const cf of courseFiles) {
            try {
              const { data: fileData, error: fileErr } = await supabase.storage
                .from('course-files')
                .download(cf.storagePath);
              if (fileErr || !fileData) continue;
              const text = await fileData.text();
              // Cap each file at 30K chars to stay within context limits
              const capped = text.substring(0, 30_000);
              parts.push(`=== ${cf.name} ===\n${capped}`);
              console.log(`[KnowledgeLayer] Loaded supplemental file: ${cf.name} (${capped.length} chars)`);
            } catch (e) {
              console.warn(`[KnowledgeLayer] Could not load supplemental file ${cf.name}:`, e);
            }
          }
          supplementalContent = parts.join("\n\n");
        }

        // ── Film: audio energy timeline ───────────────────────────────────────
        let energyTimeline = "";
        if (isFilm) {
          const rawTranscriptArr = Array.isArray(row.transcript) ? row.transcript : [];
          const audioChapters = Array.isArray(row.audio_chapters) ? row.audio_chapters : [];
          const audioSentiment = Array.isArray(row.audio_sentiment) ? row.audio_sentiment : [];
          energyTimeline = buildAudioEnergyTimeline(rawTranscriptArr, audioChapters, audioSentiment, durationSec);
          if (energyTimeline) {
            console.log(`[KnowledgeLayer] Audio energy timeline built — ${energyTimeline.length} chars`);
          } else {
            console.log(`[KnowledgeLayer] No audio energy data available (transcript may be empty or film not yet analysed)`);
          }
        }

        // ── Film: visual analysis pass on sampled keyframes ──────────────────
        let visualDescriptions = "";
        if (isFilm && row.frame_urls && Array.isArray(row.frame_urls) && row.frame_urls.length > 0) {
          console.log(`[KnowledgeLayer] Running film visual analysis on ${row.frame_urls.length} frames...`);
          visualDescriptions = await buildFilmVisualDescriptions(anthropic, row.frame_urls as string[], durationSec);
          console.log(`[KnowledgeLayer] Visual analysis complete — ${visualDescriptions.length} chars`);
        }

        // ── Call Claude — branch on film vs course ─────────────────────────
        let systemPrompt: string;
        let userPrompt: string;

        if (isFilm) {
          systemPrompt = buildFilmSystemPrompt();
          // Merge visual descriptions into the frame summary for the film prompt
          const enrichedFrameSummary = visualDescriptions
            ? `--- AI VISUAL DESCRIPTIONS (sampled keyframes) ---\n${visualDescriptions}\n\n--- OCR TEXT (on-screen text only) ---\n${frameSummary}`
            : frameSummary;
          userPrompt = buildFilmUserPrompt(moduleTitle, durationStr, transcriptChunk, enrichedFrameSummary, supplementalContent, energyTimeline);
          console.log(`[KnowledgeLayer] FILM MODE — calling Claude Sonnet 4.6 for ${table}:${moduleId || courseId}`);
        } else {
          systemPrompt = buildSystemPrompt(fps);
          userPrompt = buildUserPrompt(moduleTitle, durationStr, transcriptChunk, frameSummary, fps);
          console.log(`[KnowledgeLayer] COURSE MODE — calling Claude Sonnet 4.6 for ${table}:${moduleId || courseId}`);
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

  // Section headers we expect (in order) — covers both course and film sections
  const SECTION_NAMES = [
    // Course sections
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
    // Film sections
    "TITLE",
    "GENRE & TONE",
    "LOGLINE",
    "THEMATIC DNA",
    "STORY STRUCTURE",
    "CHARACTER PROFILES",
    "PROTAGONIST TRANSFORMATION ARC",
    "ANTAGONIST FUNCTION",
    "POWER DYNAMICS",
    "SCENE-BY-SCENE BREAKDOWN",
    "WORLD-BUILDING & DOMAIN LAYER",
    "SUBPLOT & B-STORY STRUCTURE",
    "TONE MAP",
    "SIGNATURE SET PIECES",
    "DIALOGUE STYLE PROFILE",
    "EMOTIONAL ARCHITECTURE",
    "AUDIO ENERGY TIMELINE",
    "ADAPTATION BLUEPRINT",
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
    // ── Shared ──────────────────────────────────────────────────────────────
    module_title: sections["MODULE TITLE"] || sections["TITLE"] || title,
    duration: sections["DURATION"] || duration,
    retrieval_tags: tags,
    generated_at: new Date().toISOString(),

    // ── Course / training fields ─────────────────────────────────────────────
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
    full_transcript: sections["FULL CLEANED TRANSCRIPT"] || "",

    // ── Film / TV fields ─────────────────────────────────────────────────────
    genre_tone: sections["GENRE & TONE"] || "",
    logline: sections["LOGLINE"] || "",
    thematic_dna: sections["THEMATIC DNA"] || "",
    story_structure: sections["STORY STRUCTURE"] || "",
    character_profiles: sections["CHARACTER PROFILES"] || "",
    protagonist_arc: sections["PROTAGONIST TRANSFORMATION ARC"] || "",
    antagonist_function: sections["ANTAGONIST FUNCTION"] || "",
    power_dynamics: sections["POWER DYNAMICS"] || "",
    scene_breakdown: sections["SCENE-BY-SCENE BREAKDOWN"] || "",
    world_building: sections["WORLD-BUILDING & DOMAIN LAYER"] || "",
    subplot_structure: sections["SUBPLOT & B-STORY STRUCTURE"] || "",
    tone_map: sections["TONE MAP"] || "",
    signature_set_pieces: sections["SIGNATURE SET PIECES"] || "",
    dialogue_style: sections["DIALOGUE STYLE PROFILE"] || "",
    emotional_architecture: sections["EMOTIONAL ARCHITECTURE"] || "",
    audio_energy_timeline: sections["AUDIO ENERGY TIMELINE"] || "",
    adaptation_blueprint: sections["ADAPTATION BLUEPRINT"] || "",
  };
}
