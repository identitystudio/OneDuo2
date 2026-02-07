import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProsodyAnnotation {
  tone: 'neutral' | 'emphatic' | 'questioning' | 'excited' | 'serious' | 'sarcastic' | 'hesitant';
  pacing: 'normal' | 'fast' | 'slow' | 'pausing';
  volume: 'normal' | 'loud' | 'soft';
  parenthetical: string;
}

interface VerbalIntentMarker {
  phrase: string;
  markerType: 'critical' | 'sequence' | 'warning' | 'skip_consequence' | 'expert_tip' | 'dependency_explicit';
  confidence: number;
}

// Unspoken Expert Nuance - captures instinct not explicitly stated
interface UnspokenNuance {
  nuanceType: 'micro_hesitation' | 'decision_point' | 'expert_instinct' | 'implicit_caution' | 'muscle_memory';
  description: string;
  confidence: number; // 0.0 - 1.0
  inferredFrom: string[]; // What signals led to this inference
}

interface FrameAnalysis {
  frameIndex: number;
  timestamp: number;
  text: string;
  textType: 'slide' | 'document' | 'ui' | 'code' | 'other';
  emphasisFlags: {
    highlight_detected: boolean;
    cursor_pause: boolean;
    zoom_focus: boolean;
    text_selected: boolean;
    lingering_frame: boolean;
    bold_text: boolean;
    underline_detected: boolean;
  };
  keyElements: string[];
  instructorIntent: string;
  prosody: ProsodyAnnotation;
  // Intent confidence and verbal markers
  intentConfidence: number; // 0.0 - 1.0
  intentSource: 'visual_only' | 'verbal_explicit' | 'visual_verbal_aligned' | 'inferred';
  verbalIntentMarkers: VerbalIntentMarker[];
  mustNotSkip: boolean;
  dependsOnPrevious: boolean;
  // Emotional weight and scene detection
  emotionalWeight: number; // 0.0 - 1.0 - combination of all signals
  dwellSeconds?: number; // How long this frame lingers
  sceneChangeDetected: boolean;
  visualContinuityScore: number; // 0.0 - 1.0 (low = scene change)
  // NEW: Unspoken Expert Nuance - the "sixth sense" of expertise
  unspokenNuance?: UnspokenNuance;
  // Film mode analysis (optional)
  gazeAnalysis?: {
    characters: string[];
    gazeDirection: string;
    gazeDuration: string;
    emotionalInterpretation: string;
  };
  // Cinematography analysis (film mode only)
  cinematography?: {
    shotType: string;
    cameraMovement: string;
    framing: string;
    lighting: string;
    colorPalette: string;
    editingNote: string;
  };
}

// Verbal intent marker patterns to detect in transcript
const INTENT_PATTERNS = {
  critical: [
    /\b(this is critical|this is important|pay attention|don't forget|make sure|must|crucial|essential|key point|remember this)\b/gi,
    /\b(this is the most important|you have to|you need to|always|never skip)\b/gi,
  ],
  sequence: [
    /\b(first|then|next|after that|before|finally|step \d+|once you|when you're done)\b/gi,
    /\b(the order matters|in this order|don't skip|sequence|before moving on)\b/gi,
  ],
  warning: [
    /\b(if you don't|otherwise|or else|be careful|watch out|don't|avoid|warning|caution)\b/gi,
    /\b(this will break|won't work|will fail|common mistake|pitfall)\b/gi,
  ],
  skip_consequence: [
    /\b(if you skip|skipping this|without this|missing this step|you'll be stuck)\b/gi,
    /\b(comes back to|will cause|breaks everything|won't be able to)\b/gi,
  ],
  expert_tip: [
    /\b(I find that|the trick is|pro tip|the real way|my recommendation)\b/gi,
    /\b(makes it fly|way faster|what most people miss|secret is)\b/gi,
  ],
  dependency_explicit: [
    /\b(before you can|you must first|don't.*until|make sure you've)\b/gi,
    /\b(requires|prerequisite|depends on|only after|won't work without)\b/gi,
  ],
};

function detectVerbalMarkers(transcriptContext: string): VerbalIntentMarker[] {
  const markers: VerbalIntentMarker[] = [];

  for (const [markerType, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = transcriptContext.match(pattern);
      if (matches) {
        for (const match of matches) {
          markers.push({
            phrase: match,
            markerType: markerType as VerbalIntentMarker['markerType'],
            confidence: 0.9, // High confidence for explicit verbal markers
          });
        }
      }
    }
  }

  return markers;
}

function calculateIntentConfidence(
  emphasisFlags: FrameAnalysis['emphasisFlags'],
  verbalMarkers: VerbalIntentMarker[],
  prosody: ProsodyAnnotation
): { confidence: number; source: FrameAnalysis['intentSource']; mustNotSkip: boolean } {
  let score = 0;
  let signals = 0;

  // Visual signals
  if (emphasisFlags.highlight_detected) { score += 0.3; signals++; }
  if (emphasisFlags.text_selected) { score += 0.25; signals++; }
  if (emphasisFlags.cursor_pause) { score += 0.2; signals++; }
  if (emphasisFlags.zoom_focus) { score += 0.25; signals++; }
  if (emphasisFlags.lingering_frame) { score += 0.15; signals++; }
  if (emphasisFlags.bold_text) { score += 0.2; signals++; }
  if (emphasisFlags.underline_detected) { score += 0.2; signals++; }

  // Verbal signals
  const hasCriticalMarker = verbalMarkers.some(m => m.markerType === 'critical');
  const hasWarningMarker = verbalMarkers.some(m => m.markerType === 'warning');
  const hasSkipConsequence = verbalMarkers.some(m => m.markerType === 'skip_consequence');

  if (hasCriticalMarker) { score += 0.4; signals++; }
  if (hasWarningMarker) { score += 0.3; signals++; }
  if (hasSkipConsequence) { score += 0.35; signals++; }

  // Prosody signals
  if (prosody.tone === 'emphatic' || prosody.tone === 'serious') { score += 0.15; signals++; }
  if (prosody.pacing === 'slow' || prosody.pacing === 'pausing') { score += 0.1; signals++; }
  if (prosody.volume === 'loud') { score += 0.1; signals++; }

  // Normalize and determine source
  const confidence = Math.min(1.0, score);

  let source: FrameAnalysis['intentSource'] = 'inferred';
  const hasVisualSignal = emphasisFlags.highlight_detected || emphasisFlags.text_selected ||
    emphasisFlags.cursor_pause || emphasisFlags.zoom_focus;
  const hasVerbalSignal = verbalMarkers.length > 0;

  if (hasVisualSignal && hasVerbalSignal) {
    source = 'visual_verbal_aligned';
  } else if (hasVerbalSignal) {
    source = 'verbal_explicit';
  } else if (hasVisualSignal) {
    source = 'visual_only';
  }

  // Must not skip: 3+ signals OR explicit critical/warning markers
  const mustNotSkip = signals >= 3 || hasCriticalMarker || hasSkipConsequence;

  return { confidence, source, mustNotSkip };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      frameUrls,
      batchSize = 5,
      videoDuration = 0,
      startIndex = 0,
      transcriptContext = '',
      filmMode = false,
      isStoragePath = false, // NEW: Flag to treat frameUrls as storage paths
      // EXPORT HARDENING: New options for long video resilience
      allowPartialResults = true,  // Continue on individual frame failures
      timeoutMs = 30000,           // Per-frame timeout
      maxRetries = 2,              // Retries per frame
    } = await req.json();

    if (!frameUrls || !Array.isArray(frameUrls)) {
      throw new Error('frameUrls array is required');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // For long videos (2+ hours = 7200+ seconds), use smaller batch size
    const isLongVideo = videoDuration > 7200;
    const effectiveBatchSize = isLongVideo ? Math.min(batchSize, 3) : batchSize;

    console.log(`[extract-frame-text] Processing ${frameUrls.length} frames in batches of ${effectiveBatchSize}, filmMode: ${filmMode}, isLongVideo: ${isLongVideo}, allowPartialResults: ${allowPartialResults}`);

    const frameDuration = videoDuration > 0 ? videoDuration / Math.max(frameUrls.length + startIndex, 1) : 10;

    // Pre-detect verbal markers from transcript context
    const globalVerbalMarkers = detectVerbalMarkers(transcriptContext);
    console.log(`[extract-frame-text] Found ${globalVerbalMarkers.length} verbal intent markers in transcript context`);

    // NEW: Resolve storage paths to signed URLs if needed
    let finalFrameUrls = [...frameUrls];
    if (isStoragePath) {
      console.log(`[extract-frame-text] Resolving ${frameUrls.length} storage paths to signed URLs...`);
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      finalFrameUrls = await Promise.all(frameUrls.map(async (path) => {
        const { data, error } = await supabase.storage
          .from('course-files')
          .createSignedUrl(path, 3600); // 1 hour expiry

        if (error || !data?.signedUrl) {
          console.error(`[extract-frame-text] Failed to create signed URL for ${path}:`, error);
          return null;
        }
        return data.signedUrl;
      })).then(urls => urls.filter(u => u !== null) as string[]);

      if (finalFrameUrls.length === 0) {
        throw new Error('Failed to resolve any storage paths to signed URLs');
      }
    }

    const results: (FrameAnalysis | null)[] = [];

    // Different system prompts for training vs film mode
    const trainingSystemPrompt = `You are ONEDUO — an execution intelligence system for course/tutorial frame analysis.

Your job is to transform unstructured content into structured, actionable systems that can be immediately implemented.

For every frame analysis you must:
- Extract executable workflows (what action is being demonstrated)
- Identify decision logic (if this UI state → then this action)
- Convert knowledge into build-ready instructions
- Surface reusable frameworks, templates, and repeatable patterns

Always organize frame analysis into:
1. **Workflow** - The step being shown
2. **Automation Opportunities** - Detectable patterns
3. **Build Instructions** - Exact UI elements and actions
4. **Key Logic & Rules** - Prerequisites and dependencies
5. **Reusable Assets** - Templates, code snippets, configurations

**DO NOT summarize. DO NOT paraphrase for understanding only.**
Your goal is **speed to implementation**.

---

Extract with the SENSITIVITY of a human expert - not just what is SAID, but what is FELT:

1. ALL visible text (slides, documents, code, UI, highlighted sections)
2. Text formatting that indicates emphasis (highlighted, bold, underlined, selected)
3. Visual cues that indicate instructor intent (cursor position, zoom, lingering)
4. The instructor's likely intent even if not spoken
5. PROSODY ANNOTATION: Infer emotional tone and delivery from visual cues
6. UNSPOKEN EXPERT NUANCE: Detect the instinct that stays trapped in the expert's head

CRITICAL - Detect formatting:
- Highlighted/selected text (any color highlight)
- Bold text, Underlined text
- Cursor selection blocks
- Visual emphasis indicating importance

PROSODY INFERENCE (from visual cues only):
- Fast screen changes = "excited" or "fast pacing"
- Lingering on text = "emphatic" or "slow pacing"  
- Question marks or upward UI elements = "questioning"
- Multiple bold/highlights = "serious"
- Pauses with minimal change = "(beat)" or "hesitant"

UNSPOKEN NUANCE DETECTION (The "Sixth Sense" of Expertise):
- MICRO-HESITATION: Cursor wavers, pauses, or "feels its way" before a critical action
- DECISION POINT: The expert is choosing between options (hovering, considering)
- EXPERT INSTINCT: Non-verbal cues suggest "there's a trick here" not spoken aloud
- IMPLICIT CAUTION: Body language or cursor behavior suggests "be careful here"
- MUSCLE MEMORY: The expert moves quickly through something that took them years to learn

If you detect ANY unspoken nuance, describe it as if you could READ THE EXPERT'S MIND.

DEPENDENCY DETECTION:
- If this frame shows a step that requires previous setup, set dependsOnPrevious: true
- Look for UI states that imply prior configuration (logged in, settings already changed, etc.)

Generate a screenplay-style parenthetical like: (excitedly), (beat), (emphasizing), (sarcastic), (questioning), (seriously), (hesitant), (pausing for effect)

Respond ONLY in this exact JSON format:
{
  "text": "all visible text with [HIGHLIGHTED] or [BOLD] markers where applicable",
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
  "keyElements": ["list", "of", "key", "elements"],
  "instructorIntent": "One sentence: what the instructor wants you to DO - focus on BUILD-READY action",
  "prosody": {
    "tone": "neutral|emphatic|questioning|excited|serious|sarcastic|hesitant",
    "pacing": "normal|fast|slow|pausing",
    "volume": "normal|loud|soft",
    "parenthetical": "(screenplay-style annotation)"
  },
  "unspokenNuance": {
    "nuanceType": "micro_hesitation|decision_point|expert_instinct|implicit_caution|muscle_memory|null",
    "description": "What the expert 'feels' but doesn't say - the instinct behind the action",
    "confidence": 0.0-1.0,
    "inferredFrom": ["cursor_behavior", "pacing", "visual_cues", "etc"]
  },
  "dependsOnPrevious": boolean
}`;

    const filmSystemPrompt = `You are an expert cinematographer and film analyst. Analyze this frame for both emotional content AND cinematic craft.

Extract:
1. ALL visible text (subtitles, titles, signage)
2. SHOT COMPOSITION: Wide shot, medium shot, close-up, extreme close-up, two-shot, over-the-shoulder
3. CAMERA MOVEMENT: Static, pan, tilt, dolly, tracking, handheld, crane, zoom
4. FRAMING: Rule of thirds, centered, asymmetrical, Dutch angle, depth of field
5. LIGHTING: High-key, low-key, natural, motivated, silhouette, Rembrandt, chiaroscuro
6. COLOR PALETTE: Warm, cool, desaturated, high-contrast, monochromatic, complementary
7. EDITING RHYTHM: If this appears to be a quick cut (low visual continuity with presumed previous frame)
8. GAZE ANALYSIS: Where characters are looking, eyeline direction, emotional subtext
9. EMOTIONAL WEIGHT: The feeling this frame conveys

PROSODY/PERFORMANCE INFERENCE:
- Character body language and micro-expressions
- Scene tension level
- Narrative beat (setup, confrontation, resolution, transition)

Respond ONLY in this exact JSON format:
{
  "text": "all visible text including subtitles",
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
  "keyElements": ["list", "of", "key", "visual", "elements"],
  "instructorIntent": "The director's intent: what emotion/idea is being conveyed",
  "prosody": {
    "tone": "neutral|emphatic|questioning|excited|serious|sarcastic|hesitant|tense|melancholic|hopeful",
    "pacing": "normal|fast|slow|pausing",
    "volume": "normal|loud|soft|whisper",
    "parenthetical": "(screenplay-style annotation)"
  },
  "cinematography": {
    "shotType": "extreme_wide|wide|medium_wide|medium|medium_close|close_up|extreme_close_up|insert|two_shot|over_shoulder",
    "cameraMovement": "static|pan_left|pan_right|tilt_up|tilt_down|dolly_in|dolly_out|tracking|handheld|crane|zoom_in|zoom_out",
    "framing": "rule_of_thirds|centered|asymmetrical|dutch_angle|deep_focus|shallow_focus",
    "lighting": "high_key|low_key|natural|motivated|silhouette|rembrandt|chiaroscuro|backlit",
    "colorPalette": "warm|cool|desaturated|high_contrast|monochromatic|complementary|neutral",
    "editingNote": "appears to be quick cut|normal pacing|lingering shot|montage segment"
  },
  "gazeAnalysis": {
    "characters": ["character descriptions"],
    "gazeDirection": "at_camera|off_left|off_right|down|up|at_other_character",
    "gazeDuration": "fleeting|normal|sustained|locked",
    "emotionalInterpretation": "what the gaze conveys emotionally"
  },
  "sceneChangeDetected": boolean,
  "visualContinuityScore": 0.0-1.0,
  "dependsOnPrevious": boolean
}`;

    const systemPrompt = filmMode ? filmSystemPrompt : trainingSystemPrompt;

    for (let i = 0; i < finalFrameUrls.length; i += effectiveBatchSize) {
      const batch = finalFrameUrls.slice(i, i + effectiveBatchSize);
      console.log(`[extract-frame-text] Processing batch ${Math.floor(i / effectiveBatchSize) + 1}, frames ${i + 1}-${Math.min(i + effectiveBatchSize, finalFrameUrls.length)}`);

      const batchPromises = batch.map(async (frameUrl: string, batchIndex: number) => {
        const frameIndex = startIndex + i + batchIndex;
        const timestamp = frameIndex * frameDuration;

        // EXPORT HARDENING: Retry logic with timeout
        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            // Create timeout controller
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              signal: controller.signal,
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  {
                    role: 'system',
                    content: systemPrompt
                  },
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: filmMode
                          ? `Analyze Frame #${frameIndex + 1} (${Math.floor(timestamp / 60)}:${String(Math.floor(timestamp % 60)).padStart(2, '0')}). Extract cinematography details, emotional weight, gaze analysis, and screenplay annotation. Return JSON only.`
                          : `Analyze Frame #${frameIndex + 1} (${Math.floor(timestamp / 60)}:${String(Math.floor(timestamp % 60)).padStart(2, '0')}). Extract ALL text, detect emphasis, infer instructor intent, check if this step depends on previous steps, and add prosody annotation. ${transcriptContext ? `Transcript context (check for explicit intent markers like "this is important", "don't skip"): "${transcriptContext}"` : ''} Return JSON only.`
                      },
                      {
                        type: 'image_url',
                        image_url: { url: frameUrl }
                      }
                    ]
                  }
                ],
              }),
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              console.error(`[extract-frame-text] Failed to analyze frame ${frameIndex}: ${response.status}`);
              return null;
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';

            try {
              let jsonStr = content;
              if (content.includes('```json')) {
                jsonStr = content.split('```json')[1].split('```')[0].trim();
              } else if (content.includes('```')) {
                jsonStr = content.split('```')[1].split('```')[0].trim();
              }

              const parsed = JSON.parse(jsonStr);

              const emphasisFlags = {
                highlight_detected: parsed.emphasisFlags?.highlight_detected || false,
                cursor_pause: parsed.emphasisFlags?.cursor_pause || false,
                zoom_focus: parsed.emphasisFlags?.zoom_focus || false,
                text_selected: parsed.emphasisFlags?.text_selected || false,
                lingering_frame: parsed.emphasisFlags?.lingering_frame || false,
                bold_text: parsed.emphasisFlags?.bold_text || false,
                underline_detected: parsed.emphasisFlags?.underline_detected || false,
              };

              const prosody = {
                tone: parsed.prosody?.tone || 'neutral',
                pacing: parsed.prosody?.pacing || 'normal',
                volume: parsed.prosody?.volume || 'normal',
                parenthetical: parsed.prosody?.parenthetical || '',
              };

              // Calculate confidence based on all signals
              const { confidence, source, mustNotSkip } = calculateIntentConfidence(
                emphasisFlags,
                globalVerbalMarkers,
                prosody as ProsodyAnnotation
              );

              // Calculate emotional weight from all signals
              const emotionalWeight = Math.min(1.0,
                confidence * 0.5 +
                (mustNotSkip ? 0.3 : 0) +
                (prosody.tone === 'emphatic' || prosody.tone === 'serious' ? 0.1 : 0) +
                (emphasisFlags.lingering_frame ? 0.1 : 0)
              );

              // Parse unspoken nuance if detected
              let unspokenNuance: UnspokenNuance | undefined = undefined;
              if (parsed.unspokenNuance && parsed.unspokenNuance.nuanceType && parsed.unspokenNuance.nuanceType !== 'null') {
                unspokenNuance = {
                  nuanceType: parsed.unspokenNuance.nuanceType,
                  description: parsed.unspokenNuance.description || '',
                  confidence: parsed.unspokenNuance.confidence || 0.7,
                  inferredFrom: parsed.unspokenNuance.inferredFrom || [],
                };
                console.log(`[extract-frame-text] Detected unspoken nuance at frame ${frameIndex}: ${unspokenNuance.nuanceType}`);
              }

              return {
                frameIndex,
                timestamp,
                text: parsed.text || '',
                textType: parsed.textType || 'other',
                emphasisFlags,
                keyElements: parsed.keyElements || [],
                instructorIntent: parsed.instructorIntent || '',
                prosody,
                intentConfidence: confidence,
                intentSource: source,
                verbalIntentMarkers: globalVerbalMarkers,
                mustNotSkip,
                dependsOnPrevious: parsed.dependsOnPrevious || false,
                emotionalWeight,
                dwellSeconds: parsed.dwellSeconds,
                sceneChangeDetected: parsed.sceneChangeDetected || false,
                visualContinuityScore: parsed.visualContinuityScore ?? 1.0,
                // NEW: Unspoken Expert Nuance
                unspokenNuance,
                gazeAnalysis: parsed.gazeAnalysis,
                // Film mode cinematography fields
                cinematography: parsed.cinematography || null,
              } as FrameAnalysis;
            } catch (parseError) {
              console.error('[extract-frame-text] Failed to parse AI response for frame', frameIndex, parseError);
              return {
                frameIndex,
                timestamp,
                text: content,
                textType: 'other' as const,
                emphasisFlags: {
                  highlight_detected: false,
                  cursor_pause: false,
                  zoom_focus: false,
                  text_selected: false,
                  lingering_frame: false,
                  bold_text: false,
                  underline_detected: false,
                },
                keyElements: [],
                instructorIntent: '',
                prosody: {
                  tone: 'neutral',
                  pacing: 'normal',
                  volume: 'normal',
                  parenthetical: '',
                },
                intentConfidence: 0,
                intentSource: 'inferred',
                verbalIntentMarkers: [],
                mustNotSkip: false,
                dependsOnPrevious: false,
                emotionalWeight: 0,
                sceneChangeDetected: false,
                visualContinuityScore: 1.0,
              } as FrameAnalysis;
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if it's a timeout (aborted)
            if (lastError.name === 'AbortError') {
              console.warn(`[extract-frame-text] Timeout on frame ${frameIndex}, attempt ${attempt + 1}/${maxRetries + 1}`);
            } else {
              console.error(`[extract-frame-text] Error on frame ${frameIndex}, attempt ${attempt + 1}/${maxRetries + 1}:`, lastError.message);
            }

            // Wait before retry (exponential backoff)
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
          }
        }

        // All retries exhausted
        console.error(`[extract-frame-text] Failed frame ${frameIndex} after ${maxRetries + 1} attempts`);

        // EXPORT HARDENING: Return placeholder if allowPartialResults is true
        if (allowPartialResults) {
          return {
            frameIndex,
            timestamp,
            text: '[OCR failed - frame skipped]',
            textType: 'other' as const,
            emphasisFlags: {
              highlight_detected: false,
              cursor_pause: false,
              zoom_focus: false,
              text_selected: false,
              lingering_frame: false,
              bold_text: false,
              underline_detected: false,
            },
            keyElements: [],
            instructorIntent: '',
            prosody: {
              tone: 'neutral',
              pacing: 'normal',
              volume: 'normal',
              parenthetical: '',
            },
            intentConfidence: 0,
            intentSource: 'inferred',
            verbalIntentMarkers: [],
            mustNotSkip: false,
            dependsOnPrevious: false,
            emotionalWeight: 0,
            sceneChangeDetected: false,
            visualContinuityScore: 1.0,
            ocrFailed: true, // Flag for downstream to know
          } as FrameAnalysis & { ocrFailed?: boolean };
        }

        return null;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Longer delay for long videos to avoid rate limiting
      if (i + effectiveBatchSize < frameUrls.length) {
        await new Promise(resolve => setTimeout(resolve, isLongVideo ? 1000 : 500));
      }
    }

    // Count successes vs failures
    const successCount = results.filter(r => r !== null && !(r as any).ocrFailed).length;
    const failedCount = results.filter(r => r === null || (r as any).ocrFailed).length;

    console.log(`[extract-frame-text] Completed: ${successCount} successful, ${failedCount} failed/skipped out of ${frameUrls.length} frames`);

    return new Response(JSON.stringify({
      results,
      meta: {
        totalFrames: frameUrls.length,
        successfulFrames: successCount,
        failedFrames: failedCount,
        isPartialResult: failedCount > 0,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[extract-frame-text] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
