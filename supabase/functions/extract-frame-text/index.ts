import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FrameAnalysis {
    frameIndex: number;
    timestamp: number;
    text: string;
    ocr_confidence: number;
    ui_state: string;
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
    visualDescription?: string;
    prosody: {
        tone: string;
        pacing: string;
        volume: string;
        parenthetical: string;
    };
    dependsOnPrevious: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const {
            frameUrls,
            videoDuration = 0,
            startIndex = 0,
            totalFrameCount = 0,
            transcriptContext = '',
            allowPartialResults = true,
            maxRetries = 2,
        } = await req.json();

        if (!frameUrls || !Array.isArray(frameUrls)) {
            throw new Error('frameUrls array is required');
        }

        const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN") || Deno.env.get("REPLICATE_API_KEY");
        if (!REPLICATE_API_TOKEN) {
            throw new Error('REPLICATE_API_TOKEN is not configured');
        }

        const replicate = new Replicate({
            auth: REPLICATE_API_TOKEN,
        });

        // Use totalFrameCount if provided (correct), otherwise fall back to batch size + startIndex (legacy)
        const effectiveTotalFrames = totalFrameCount > 0 ? totalFrameCount : (frameUrls.length + startIndex);
        const frameDuration = videoDuration > 0 ? videoDuration / Math.max(effectiveTotalFrames, 1) : 10;

        console.log(`[extract-frame-text] Processing ${frameUrls.length} frames concurrently using Replicate...`);

        const results = await Promise.all(frameUrls.map(async (frameUrl, i) => {
            const frameIndex = startIndex + i;
            const timestamp = frameIndex * frameDuration;

            console.log(`[extract-frame-text] Analyzing frame ${frameIndex + 1}/${frameUrls.length + startIndex}`);

            let lastError = null;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const output = await replicate.run(
                        "yorickvp/llava-v1.6-vicuna-13b:0603dec596080fa084e26f0ae6d605fc5788ed2b1a0358cd25010619487eae63",
                        {
                            input: {
                                image: frameUrl,
                                prompt: `You are an expert observer watching a masterclass. Describe this moment exactly as a human expert would.

                                 PSYCHOLOGICAL & ARCHITECTURAL PERCEPTION:
                                 1. Cognitive & Visual State: Identify if this is a "Static UI" (slide/document), "Dynamic UI" (tool/code interaction), or "Talking Head".
                                 2. Social Posture: Interpret the instructor's "stance" towards the audience. 
                                 3. FOCUS INTENSITY: Capture cursor placement, text highlights, and specific UI elements being discussed.
                                 4. OCR QUALITY: Assess the readability of the text on screen. 

                                 CRITICAL: Detect whenever the UI state changes (e.g. from slide to code).
                                 
                                 ${transcriptContext ? `Context from transcript: "${transcriptContext.substring(0, 500)}"` : ''}

                                 Return ONLY a JSON object in this format:
                                 {
                                   "text": "all OCR text relevant to this moment",
                                   "ocr_confidence": 0-1,
                                   "ui_state": "slide|code|ui|walking|demonstration",
                                   "visualDescription": "High-fidelity psychological narrative.",
                                   "emphasisFlags": {
                                     "highlight_detected": boolean,
                                     "cursor_pause": boolean,
                                     "zoom_focus": boolean,
                                     "text_selected": boolean,
                                     "lingering_frame": boolean,
                                     "bold_text": boolean,
                                     "underline_detected": boolean
                                   },
                                   "keyElements": ["list", "of", "critical", "elements"],
                                   "instructorIntent": "The deeper 'why' and actionable build instruction",
                                   "dependsOnPrevious": boolean
                                 }`,
                                max_new_tokens: 1024,
                                history: []
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
                        frameIndex,
                        timestamp,
                        text: parsed.text || '',
                        ocr_confidence: parsed.ocr_confidence || 0.8,
                        ui_state: parsed.ui_state || 'unknown',
                        visualDescription: parsed.visualDescription || parsed.visual_description || '',
                        textType: parsed.ui_state || 'other',
                        emphasisFlags: {
                            highlight_detected: !!(parsed.emphasisFlags?.highlight_detected || parsed.emphasisFlags?.highlightDetected),
                            cursor_pause: !!(parsed.emphasisFlags?.cursor_pause || parsed.emphasisFlags?.cursorPause),
                            zoom_focus: !!(parsed.emphasisFlags?.zoom_focus || parsed.emphasisFlags?.zoomFocus),
                            text_selected: !!(parsed.emphasisFlags?.text_selected || parsed.emphasisFlags?.textSelected),
                            lingering_frame: !!(parsed.emphasisFlags?.lingering_frame || parsed.emphasisFlags?.lingeringFrame),
                            bold_text: !!(parsed.emphasisFlags?.bold_text || parsed.emphasisFlags?.boldText),
                            underline_detected: !!(parsed.emphasisFlags?.underline_detected || parsed.emphasisFlags?.underlineDetected),
                        },
                        keyElements: parsed.keyElements || parsed.key_elements || [],
                        instructorIntent: parsed.instructorIntent || parsed.instructor_intent || '',
                        prosody: parsed.prosody || { tone: 'neutral', pacing: 'normal', volume: 'normal', parenthetical: '' },
                        dependsOnPrevious: !!parsed.dependsOnPrevious
                    };
                } catch (error) {
                    lastError = error;
                    console.error(`[extract-frame-text] Attempt ${attempt + 1} failed for frame ${frameIndex}:`, error);
                    if (attempt < maxRetries) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Reduced wait for parallel
                    }
                }
            }

            if (allowPartialResults) {
                return {
                    frameIndex,
                    timestamp,
                    text: '[Analysis failed]',
                    ocr_confidence: 0,
                    ui_state: 'error',
                    textType: 'other',
                    emphasisFlags: { highlight_detected: false, cursor_pause: false, zoom_focus: false, text_selected: false, lingering_frame: false, bold_text: false, underline_detected: false },
                    keyElements: [],
                    instructorIntent: 'Skip due to error',
                    visualDescription: 'Error during analysis',
                    prosody: { tone: 'neutral', pacing: 'normal', volume: 'normal', parenthetical: '' },
                    dependsOnPrevious: false
                };
            } else {
                throw lastError || new Error(`Failed to analyze frame ${frameIndex}`);
            }
        }));

        return new Response(JSON.stringify({ results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('[extract-frame-text] Fatal error:', error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
