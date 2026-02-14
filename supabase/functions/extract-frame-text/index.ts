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

interface UnspokenNuance {
  nuanceType: 'micro_hesitation' | 'decision_point' | 'expert_instinct' | 'implicit_caution' | 'muscle_memory';
  description: string;
  confidence: number;
  inferredFrom: string[];
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
  intentConfidence: number;
  intentSource: 'visual_only' | 'verbal_explicit' | 'visual_verbal_aligned' | 'inferred';
  verbalIntentMarkers: VerbalIntentMarker[];
  mustNotSkip: boolean;
  dependsOnPrevious: boolean;
  emotionalWeight: number;
  dwellSeconds?: number;
  sceneChangeDetected: boolean;
  visualContinuityScore: number;
  visual_description?: string;
  unspokenNuance?: UnspokenNuance;
  gazeAnalysis?: {
    characters: string[];
    gazeDirection: string;
    gazeDuration: string;
    emotionalInterpretation: string;
  };
  cinematography?: {
    shotType: string;
    cameraMovement: string;
    framing: string;
    lighting: string;
    colorPalette: string;
    editingNote: string;
  };
  ocrFailed?: boolean;
}

const INTENT_PATTERNS = {
  critical: [/\b(critical|important|attention|must|crucial|essential|remember this)\b/gi],
  sequence: [/\b(first|then|next|finally|step \d+)\b/gi],
  warning: [/\b(warning|caution|fail|error|wrong|careful)\b/gi],
  skip_consequence: [/\b(if you skip|missing this)\b/gi],
  expert_tip: [/\b(pro tip|trick|hack|recommendation)\b/gi],
  dependency_explicit: [/\b(requires|prerequisite|depends on)\b/gi],
};

function detectVerbalMarkers(transcriptContext: string): VerbalIntentMarker[] {
  const markers: VerbalIntentMarker[] = [];
  if (!transcriptContext) return markers;
  for (const [markerType, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = transcriptContext.match(pattern);
      if (matches) {
        for (const match of matches) {
          markers.push({ phrase: match, markerType: markerType as any, confidence: 0.9 });
        }
      }
    }
  }
  return markers;
}

function calculateIntentConfidence(
  emphasisFlags: any,
  verbalMarkers: VerbalIntentMarker[],
  prosody: ProsodyAnnotation
) {
  let score = 0;
  let signals = 0;
  if (emphasisFlags.highlight_detected) { score += 0.3; signals++; }
  if (emphasisFlags.text_selected) { score += 0.25; signals++; }
  if (emphasisFlags.cursor_pause) { score += 0.2; signals++; }
  if (emphasisFlags.zoom_focus) { score += 0.25; signals++; }
  if (verbalMarkers.some(m => m.markerType === 'critical' || m.markerType === 'warning')) { score += 0.4; signals++; }
  if (prosody.tone === 'emphatic') { score += 0.15; signals++; }
  const confidence = Math.min(1.0, score);
  let source: any = 'inferred';
  if (signals > 1) source = 'visual_verbal_aligned';
  return { confidence, source, mustNotSkip: signals >= 2 };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const {
      frameUrls, batchSize = 5, videoDuration = 0, startIndex = 0,
      transcriptContext = '', filmMode = false, isStoragePath = false,
      maxRetries = 2, allowPartialResults = true
    } = await req.json();

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY is not configured');

    const isLongVideo = videoDuration > 7200;
    const effectiveBatchSize = isLongVideo ? Math.min(batchSize, 2) : Math.min(batchSize, 3);
    const frameDuration = videoDuration > 0 ? videoDuration / Math.max(frameUrls.length + startIndex, 1) : 10;
    const globalVerbalMarkers = detectVerbalMarkers(transcriptContext);

    let finalFrameUrls = [...frameUrls];
    if (isStoragePath) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      finalFrameUrls = await Promise.all(frameUrls.map(async (path) => {
        const { data, error } = await supabase.storage.from('course-files').createSignedUrl(path, 3600);
        return error || !data?.signedUrl ? null : data.signedUrl;
      })).then(urls => urls.filter(u => u !== null) as string[]);
    }

    const trainingSystemPrompt = `You are ONEDUO — Execution Intelligence System.
Analyze this course frame. Transform it into build-ready instructions.

FIELDS TO EXTRACT:
- text: All visible text with [HIGHLIGHTED] markers.
- visual_description: CRITICAL. Describe the visual state concisely (e.g., "A cursor clicks the 'Deploy' button on AWS").
- emphasisFlags: JSON of {highlight_detected, cursor_pause, zoom_focus, text_selected, bold_text}.
- instructorIntent: One sentence ACTION for the user to DO.
- prosody: JSON of {tone, pacing, volume, parenthetical}.
- unspokenNuance: What the expert FEELS but doesn't say (instinct).
- dependsOnPrevious: boolean.

Return ONLY raw JSON.`;

    const basePrompt = filmMode ? "Cinematographer analysis mode. Analyze shotType, cameraMovement, framing, lighting, colorPalette. Return JSON." : trainingSystemPrompt;
    const results: (FrameAnalysis | null)[] = [];

    for (let i = 0; i < finalFrameUrls.length; i += effectiveBatchSize) {
      const batch = finalFrameUrls.slice(i, i + effectiveBatchSize);
      const batchPromises = batch.map(async (frameUrl, bIdx) => {
        const frameIndex = startIndex + i + bIdx;
        const timestamp = frameIndex * frameDuration;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const response = await fetch('https://api.replicate.com/v1/predictions', {
              method: 'POST',
              headers: {
                'Authorization': `Token ${REPLICATE_API_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait=60'
              },
              body: JSON.stringify({
                version: "0270611d6a36f2e2402927289ee7741d7d07e600e12399997ad92955f9f8c67a",
                input: {
                  image: frameUrl,
                  prompt: `${basePrompt}\n\nFrame #${frameIndex + 1} at ${Math.floor(timestamp / 60)}:${String(Math.floor(timestamp % 60)).padStart(2, '0')}. JSON ONLY.`,
                  max_new_tokens: 1000
                }
              }),
            });

            if (!response.ok) throw new Error(`Status ${response.status}`);
            let prediction = await response.json();

            if (prediction.status !== 'succeeded') {
              const start = Date.now();
              while (Date.now() - start < 60000) {
                await new Promise(r => setTimeout(r, 2000));
                const res = await fetch(prediction.urls.get, { headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` } });
                prediction = await res.json();
                if (prediction.status === 'succeeded' || prediction.status === 'failed') break;
              }
            }

            if (prediction.status !== 'succeeded') throw new Error(prediction.status);
            const content = Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;

            let jsonStr = content.trim();
            const sIdx = jsonStr.indexOf('{');
            const eIdx = jsonStr.lastIndexOf('}');
            if (sIdx !== -1 && eIdx !== -1) jsonStr = jsonStr.substring(sIdx, eIdx + 1);

            const parsed = JSON.parse(jsonStr);
            const emphasis = {
              highlight_detected: !!parsed.emphasisFlags?.highlight_detected,
              cursor_pause: !!parsed.emphasisFlags?.cursor_pause,
              zoom_focus: !!parsed.emphasisFlags?.zoom_focus,
              text_selected: !!parsed.emphasisFlags?.text_selected,
              lingering_frame: !!parsed.emphasisFlags?.lingering_frame,
              bold_text: !!parsed.emphasisFlags?.bold_text,
              underline_detected: !!parsed.emphasisFlags?.underline_detected,
            };
            const prosody = {
              tone: parsed.prosody?.tone || 'neutral',
              pacing: parsed.prosody?.pacing || 'normal',
              volume: parsed.prosody?.volume || 'normal',
              parenthetical: parsed.prosody?.parenthetical || '',
            };
            const { confidence, source, mustNotSkip } = calculateIntentConfidence(emphasis, globalVerbalMarkers, prosody as any);

            return {
              frameIndex, timestamp,
              text: parsed.text || '',
              textType: parsed.textType || 'other',
              visual_description: parsed.visual_description || '',
              emphasisFlags: emphasis,
              keyElements: parsed.keyElements || [],
              instructorIntent: parsed.instructorIntent || '',
              prosody,
              intentConfidence: confidence,
              intentSource: source,
              verbalIntentMarkers: globalVerbalMarkers,
              mustNotSkip,
              dependsOnPrevious: !!parsed.dependsOnPrevious,
              emotionalWeight: confidence * 0.5,
              sceneChangeDetected: false,
              visualContinuityScore: 1.0,
              unspokenNuance: parsed.unspokenNuance,
              cinematography: parsed.cinematography || null,
            } as FrameAnalysis;
          } catch (err) {
            console.warn(`Frame ${frameIndex} try ${attempt}:`, err);
            if (attempt === maxRetries) {
              if (allowPartialResults) return { frameIndex, timestamp, text: '[Analysis Failed]', textType: 'other', emphasisFlags: {} as any, prosody: {} as any, ocrFailed: true } as any;
              return null;
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        return null;
      });
      results.push(...(await Promise.all(batchPromises)));
    }

    return new Response(JSON.stringify({ results, meta: { total: frameUrls.length, success: results.filter(r => r && !r.ocrFailed).length } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fatal:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: corsHeaders });
  }
});
