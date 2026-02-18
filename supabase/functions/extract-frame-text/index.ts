import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
  visualDescription: string;
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
}

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
            confidence: 0.9,
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
  if (emphasisFlags.highlight_detected) { score += 0.3; signals++; }
  if (emphasisFlags.text_selected) { score += 0.25; signals++; }
  if (emphasisFlags.cursor_pause) { score += 0.2; signals++; }
  if (emphasisFlags.zoom_focus) { score += 0.25; signals++; }
  if (emphasisFlags.lingering_frame) { score += 0.15; signals++; }
  if (emphasisFlags.bold_text) { score += 0.2; signals++; }
  if (emphasisFlags.underline_detected) { score += 0.2; signals++; }

  const hasCriticalMarker = verbalMarkers.some(m => m.markerType === 'critical');
  const hasWarningMarker = verbalMarkers.some(m => m.markerType === 'warning');
  const hasSkipConsequence = verbalMarkers.some(m => m.markerType === 'skip_consequence');

  if (hasCriticalMarker) { score += 0.4; signals++; }
  if (hasWarningMarker) { score += 0.3; signals++; }
  if (hasSkipConsequence) { score += 0.35; signals++; }

  if (prosody.tone === 'emphatic' || prosody.tone === 'serious') { score += 0.15; signals++; }
  if (prosody.pacing === 'slow' || prosody.pacing === 'pausing') { score += 0.1; signals++; }
  if (prosody.volume === 'loud') { score += 0.1; signals++; }

  const confidence = Math.min(1.0, score);
  let source: FrameAnalysis['intentSource'] = 'inferred';
  const hasVisualSignal = emphasisFlags.highlight_detected || emphasisFlags.text_selected || emphasisFlags.cursor_pause || emphasisFlags.zoom_focus;
  const hasVerbalSignal = verbalMarkers.length > 0;

  if (hasVisualSignal && hasVerbalSignal) source = 'visual_verbal_aligned';
  else if (hasVerbalSignal) source = 'verbal_explicit';
  else if (hasVisualSignal) source = 'visual_only';

  const mustNotSkip = signals >= 3 || hasCriticalMarker || hasSkipConsequence;
  return { confidence, source, mustNotSkip };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const {
      frameUrls,
      batchSize = 5,
      videoDuration = 0,
      startIndex = 0,
      transcriptContext = '',
      isStoragePath = false,
      allowPartialResults = true,
      timeoutMs = 30000,
      maxRetries = 2,
    } = await req.json();

    if (!frameUrls || !Array.isArray(frameUrls)) throw new Error('frameUrls array is required');

    const GEMINI_API_KEY = "AIzaSyCEs2qXfxlEz2mimTf8a1YoDT8ahOCxpjU";
    const isLongVideo = videoDuration > 7200;
    const effectiveBatchSize = isLongVideo ? Math.min(batchSize, 3) : batchSize;
    const frameDuration = videoDuration > 0 ? videoDuration / Math.max(frameUrls.length + startIndex, 1) : 10;
    const globalVerbalMarkers = detectVerbalMarkers(transcriptContext);

    console.log(`[extract-frame-text] Using Gemini 2.5 Flash for ${frameUrls.length} frames...`);

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

    const systemPrompt = `You are ONEDUO — an execution intelligence system for course/tutorial frame analysis.
Your job is to transform unstructured content into structured, actionable systems.
Extract:
1. ALL visible text (slides, code, UI)
2. Visual cues that indicate importance (highlights, bold, cursor usage)
3. Visual description for PDF captions

Respond ONLY in JSON format:
{
  "text": "all visible text",
  "visualDescription": "1-2 sentence description for a caption",
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
  "keyElements": ["list"],
  "instructorIntent": "actionable instruction",
  "prosody": {
    "tone": "neutral|emphatic|questioning|excited|serious|sarcastic|hesitant",
    "pacing": "normal|fast|slow|pausing",
    "volume": "normal|loud|soft",
    "parenthetical": "(annotation)"
  },
  "dependsOnPrevious": boolean
}`;

    const results: any[] = [];
    for (let i = 0; i < finalFrameUrls.length; i += effectiveBatchSize) {
      const batch = finalFrameUrls.slice(i, i + effectiveBatchSize);
      const batchPromises = batch.map(async (frameUrl, batchIndex) => {
        const frameIndex = startIndex + i + batchIndex;
        const timestamp = frameIndex * frameDuration;

        let base64Image = '';
        let mimeType = 'image/jpeg';
        try {
          const imgResp = await fetch(frameUrl);
          const imgBlob = await imgResp.blob();
          mimeType = imgBlob.type || 'image/jpeg';
          base64Image = encode(new Uint8Array(await imgBlob.arrayBuffer()));
        } catch (e) { return null; }

        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const userPromptText = `Analyze Frame #${frameIndex + 1} (${Math.floor(timestamp / 60)}:${String(Math.floor(timestamp % 60)).padStart(2, '0')}). Return JSON only.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{ parts: [{ text: userPromptText }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
                system_instruction: { parts: [{ text: systemPrompt }] },
                generation_config: { response_mime_type: "application/json" }
              }),
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());

            console.log(`[extract-frame-text] Frame ${frameIndex} analyzed via Gemini 2.5 Flash`);

            const emphasisFlags = {
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

            const { confidence, source, mustNotSkip } = calculateIntentConfidence(emphasisFlags, globalVerbalMarkers, prosody as ProsodyAnnotation);

            return {
              frameIndex,
              timestamp,
              text: parsed.text || '',
              visualDescription: parsed.visualDescription || parsed.instructorIntent || '',
              textType: parsed.textType || 'other',
              emphasisFlags,
              keyElements: parsed.keyElements || [],
              instructorIntent: parsed.instructorIntent || '',
              prosody,
              intentConfidence: confidence,
              intentSource: source,
              verbalIntentMarkers: globalVerbalMarkers,
              mustNotSkip,
              dependsOnPrevious: !!parsed.dependsOnPrevious,
              emotionalWeight: confidence * 0.5 + (mustNotSkip ? 0.3 : 0),
              sceneChangeDetected: !!parsed.sceneChangeDetected,
              visualContinuityScore: parsed.visualContinuityScore ?? 1.0,
            } as FrameAnalysis;
          } catch (e) {
            lastError = e;
            if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        }
        return allowPartialResults ? { frameIndex, timestamp, text: '[Error]', textType: 'other', ocrFailed: true } : null;
      });

      results.push(...(await Promise.all(batchPromises)));
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
