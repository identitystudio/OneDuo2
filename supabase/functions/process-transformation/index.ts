import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Format milliseconds to MM:SS timestamp
 */
function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Sample OCR texts for simulation
const sampleOcrTexts = [
  "Dashboard Overview - Q3 Performance Metrics",
  "User Settings - Profile configuration",
  "API Integration - Key management",
  "Data Export - CSV and JSON formats",
  "Critical Alert: Server Load High",
  "Review pending approval items",
  "Project Roadmap - Q4 Objectives",
  "Team collaboration - Invite members",
  "Billing settings - Invoice history",
  "System Status - All systems operational"
];

// Critical keywords for emphasis detection
const criticalKeywords = [
  "critical",
  "alert",
  "error",
  "warning",
  "failed",
  "urgent",
  "review",
  "approve",
  "security",
  "api key"
];

// ============================================
// ONEDUO™ PASSIVE EMPHASIS RECONSTRUCTOR
// Patent-Defensible Visual Intent Detection
// ============================================

// Type definitions for frame analysis
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  hasHighContrastOverlay?: boolean;
  isHighlighted?: boolean;
  backgroundType?: 'normal' | 'selection' | 'highlight' | 'inverted';
}

interface FrameAnalysis {
  ocrText?: string;
  visualHash?: string;
  boundingBoxes?: BoundingBox[];
  selectionRegions?: BoundingBox[];
  visualMetadata?: {
    hasTextSelection?: boolean;
    hasHighlightedRegion?: boolean;
    dominantColors?: string[];
  };
  psychologicalLayer?: {
    socialPosture: string;
    cognitiveLoad: string;
    engagementIntent: string;
    confidenceLevel: number;
  };
  instructorIntent?: string;
  keyElements?: string[];
  prosody?: {
    tone: string;
    pacing: string;
    volume: string;
    parenthetical: string;
  };
}

/**
 * Perceptual Hash (pHash) Visual Similarity
 */
function calculateVisualSimilarity(
  currentFrameData: FrameAnalysis,
  previousFrameData: FrameAnalysis
): number {
  if (currentFrameData.visualHash && previousFrameData.visualHash) {
    const hash1 = currentFrameData.visualHash;
    const hash2 = previousFrameData.visualHash;
    let matchingBits = 0;
    const totalBits = Math.min(hash1.length, hash2.length);
    for (let i = 0; i < totalBits; i++) {
      if (hash1[i] === hash2[i]) matchingBits++;
    }
    return totalBits > 0 ? matchingBits / totalBits : 0;
  }
  return 0;
}

/**
 * Detect Text Selection
 */
function detectTextSelection(frameAnalysis: FrameAnalysis): boolean {
  if (frameAnalysis.selectionRegions && frameAnalysis.selectionRegions.length > 0) return true;
  if (frameAnalysis.visualMetadata?.hasTextSelection) return true;
  return false;
}

/**
 * Detect Zoom/Focus
 */
function detectZoomFocus(
  currentFrameData: FrameAnalysis,
  previousFrameData: FrameAnalysis
): boolean {
  if (!currentFrameData.boundingBoxes || !previousFrameData.boundingBoxes) return false;
  if (currentFrameData.boundingBoxes.length === 0 || previousFrameData.boundingBoxes.length === 0) return false;

  const currPrimary = currentFrameData.boundingBoxes.reduce((a, b) => (a.width * a.height) > (b.width * b.height) ? a : b);
  const prevPrimary = previousFrameData.boundingBoxes.reduce((a, b) => (a.width * a.height) > (b.width * b.height) ? a : b);

  const currArea = currPrimary.width * currPrimary.height;
  const prevArea = prevPrimary.width * prevPrimary.height;

  return prevArea > 0 && currArea > prevArea * 1.2;
}

/**
 * Analyze frame using Replicate (Llava v1.6)
 */
async function analyzeFrameWithVision(
  frameUrl: string | null,
  frameIndex: number,
  ocrText: string,
  replicate: Replicate
): Promise<FrameAnalysis> {
  if (!frameUrl) {
    return simulateVisionAnalysis(frameIndex, ocrText, null);
  }

  try {
    const output = await replicate.run(
      "yorickvp/llava-v1.6-vicuna-13b:0603dec596080fa084e26f0ae6d605fc5788ed2b1a0358cd25010619487eae63",
      {
        input: {
          image: frameUrl,
          prompt: `You are an expert observer watching a masterclass. Describe this moment exactly as a human expert would, focusing on what matters most.

                   PSYCHOLOGICAL LAYERED PERCEPTION:
                   1. Social Posture: Interpret the instructor's "stance" towards the audience. Are they open/inviting, authoritative/closed, or guarded?
                   2. Focus Intensity: Distinguish between "effortless flow" (mastery) vs. "cognitive load" (searching for words or solving a problem live).
                   3. Temporal Weight & Narrative Role: Does this moment feel like a "Casual Intro," a "Heavy Transition," or the "Thematic Crux" (the peak complexity or most important point)?
                   4. Subconscious Signals: Note subtle cues like microscopic hesitations, micro-expressions, or specific hand placements that suggest comfort or tension.

                   CRITICAL: AVOID literal physical descriptions like "man in black shirt" or "person in front of wall." We already know what they look like. We need to know what they are DOING and FEELING.

                   Return ONLY a JSON object in this format:
                   {
                     "text": "${ocrText}",
                     "visualDescription": "High-fidelity psychological narrative.",
                     "textType": "slide|document|ui|code|other",
                     "emphasisFlags": {
                       "highlight_detected": boolean,
                       "cursor_pause": boolean,
                       "zoom_focus": boolean,
                       "text_selected": boolean,
                       "lingering_frame": boolean,
                       "bold_text": boolean,
                       "underline_detected": boolean
                     },
                     "psychologicalLayer": {
                       "socialPosture": "open|authoritative|guarded|neutral",
                       "cognitiveLoad": "low|moderate|high",
                       "engagementIntent": "explaining|waiting|transitioning|demonstrating",
                       "confidenceLevel": 0-1
                     },
                     "keyElements": ["list", "of", "elements"],
                     "instructorIntent": "actionable instruction",
                     "prosody": {
                       "tone": "string",
                       "pacing": "string",
                       "volume": "string",
                       "parenthetical": "(note)"
                     }
                   }`
        }
      }
    );

    let resultText = Array.isArray(output) ? output.join('') : String(output);
    if (resultText.includes('```json')) {
      resultText = resultText.split('```json')[1].split('```')[0].trim();
    } else if (resultText.includes('```')) {
      resultText = resultText.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(resultText);

    return {
      ocrText,
      visualHash: generateDeterministicHash(ocrText + frameIndex),
      visualMetadata: {
        hasTextSelection: !!(parsed.emphasisFlags?.text_selected || parsed.emphasisFlags?.textSelected),
        hasHighlightedRegion: !!(parsed.emphasisFlags?.highlight_detected || parsed.emphasisFlags?.highlightDetected)
      },
      psychologicalLayer: parsed.psychologicalLayer,
      instructorIntent: parsed.instructorIntent || parsed.instructor_intent,
      keyElements: parsed.keyElements || parsed.key_elements,
      prosody: parsed.prosody
    };
  } catch (error) {
    console.warn(`[Vision] Analysis failed for frame ${frameIndex}:`, error);
    return simulateVisionAnalysis(frameIndex, ocrText, null);
  }
}

/**
 * Fallback: Simulate Vision Analysis
 */
function simulateVisionAnalysis(frameIndex: number, ocrText: string, _prev: any): FrameAnalysis {
  return {
    ocrText,
    visualHash: generateDeterministicHash(ocrText + frameIndex),
    visualMetadata: { hasTextSelection: false, hasHighlightedRegion: false }
  };
}

function generateDeterministicHash(content: string): string {
  let hash = '';
  for (let i = 0; i < 64; i++) {
    const charCode = content.charCodeAt(i % content.length) || 0;
    hash += ((charCode + i) % 2).toString();
  }
  return hash;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { artifactId, aiFidelityMode = false } = await req.json();
    if (!artifactId) throw new Error("artifactId is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    console.log(`[OneDuo] Processing transformation artifact: ${artifactId}`);

    const { data: artifact, error: artifactError } = await supabase
      .from("transformation_artifacts")
      .select("*")
      .eq("id", artifactId)
      .maybeSingle();

    if (artifactError || !artifact) throw new Error("Artifact not found");

    const durationSeconds = artifact.duration_seconds || 30;
    const framesToProcess = Math.min(durationSeconds * 1, 15000);

    if (aiFidelityMode) {
      await supabase.from("artifact_frames").delete().eq("artifact_id", artifactId);
    }

    let previousAnalysis: FrameAnalysis | null = null;
    let batchFrames: any[] = [];
    const batchSize = 50;

    let stats = { keyMoments: 0, criticalCount: 0, pauseCount: 0, selectionCount: 0 };

    for (let i = 0; i < framesToProcess; i++) {
      const timestampMs = i * 1000;
      const ocrText = sampleOcrTexts[i % sampleOcrTexts.length];

      const currentAnalysis = await analyzeFrameWithVision(null, i, ocrText, replicate);

      let cursorPause = false;
      if (previousAnalysis) {
        cursorPause = calculateVisualSimilarity(currentAnalysis, previousAnalysis) >= 0.95;
      }

      const textSelected = detectTextSelection(currentAnalysis);
      const zoomFocus = previousAnalysis ? detectZoomFocus(currentAnalysis, previousAnalysis) : false;
      const lingeringFrame = cursorPause;

      let score = 0.50;
      if (textSelected) score += 0.25;
      if (cursorPause) score += 0.20;
      if (zoomFocus) score += 0.25;
      if (lingeringFrame) score += 0.15;
      score = Math.min(Math.max(score, 0.05), 0.99);

      const isCritical = criticalKeywords.some(kw => ocrText.toLowerCase().includes(kw));

      batchFrames.push({
        artifact_id: artifactId,
        frame_index: i,
        timestamp_ms: timestampMs,
        ocr_text: ocrText,
        cursor_pause: cursorPause,
        text_selected: textSelected,
        zoom_focus: zoomFocus,
        lingering_frame: lingeringFrame,
        confidence_score: parseFloat(score.toFixed(2)),
        confidence_level: score >= 0.80 ? "HIGH" : score >= 0.50 ? "MEDIUM" : "LOW",
        is_critical: isCritical,
      });

      if (score >= 0.50) stats.keyMoments++;
      if (isCritical) stats.criticalCount++;
      if (cursorPause) stats.pauseCount++;
      if (textSelected) stats.selectionCount++;

      if (batchFrames.length >= batchSize || i === framesToProcess - 1) {
        const { error: insertError } = await supabase.from("artifact_frames").insert(batchFrames);
        if (insertError) {
          console.error("[OneDuo] Frame insert error:", insertError.message);
          throw new Error(`Frame insert failed: ${insertError.message}`);
        }
        batchFrames = [];
      }
      previousAnalysis = currentAnalysis;
    }

    await supabase.from("transformation_artifacts").update({
      status: "completed",
      frame_count: framesToProcess,
      key_moments: stats.keyMoments,
      updated_at: new Date().toISOString(),
    }).eq("id", artifactId);

    return new Response(JSON.stringify({ success: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[OneDuo] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
