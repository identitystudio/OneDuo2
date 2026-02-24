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
                                prompt: `Analyze this image from a tutorial video.
                                
                                Extract:
                                1. ALL visible text (OCR).
                                2. Detailed visual description: Focus on the layout, UI elements, and crucially, the embodied presence of the speaker (facial expressions, hand gestures, positioning).
                                3. Type of content: slide, document, ui, code, or other.
                                4. Visual transitions/interactions: Cuts, screen switches, cursor movement, or whiteboard changes. Address "where" the instructor is looking or pointing.
                                5. Speaker Presence: Detailed embodied state (posture, gestures, engagement level) and general 'vibe'.
                                6. Visual emphasis cues: highlights, bold, cursor focus, zoom.
                                7. The instructor's intent: what should the user build or do?
                                
                                ${transcriptContext ? `Context from transcript: "${transcriptContext}"` : ''}
                                
                                Return ONLY a JSON object in this format:
                                {
                                  "text": "all text found",
                                  "visualDescription": "High-fidelity description for AI reconstruction, including speaker physical presence",
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
                                  "keyElements": ["list", "of", "visual", "elements"],
                                  "instructorIntent": "actionable build instruction",
                                  "prosody": {
                                    "tone": "neutral|emphatic|etc",
                                    "pacing": "normal|etc",
                                    "volume": "normal|etc",
                                    "parenthetical": "(note about vibe/tone)"
                                  },
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
                        visualDescription: parsed.visualDescription || '',
                        textType: parsed.textType || 'other',
                        emphasisFlags: {
                            highlight_detected: !!parsed.emphasisFlags?.highlight_detected,
                            cursor_pause: !!parsed.emphasisFlags?.cursor_pause,
                            zoom_focus: !!parsed.emphasisFlags?.zoom_focus,
                            text_selected: !!parsed.emphasisFlags?.text_selected,
                            lingering_frame: !!parsed.emphasisFlags?.lingering_frame,
                            bold_text: !!parsed.emphasisFlags?.bold_text,
                            underline_detected: !!parsed.emphasisFlags?.underline_detected,
                        },
                        keyElements: parsed.keyElements || [],
                        instructorIntent: parsed.instructorIntent || '',
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
