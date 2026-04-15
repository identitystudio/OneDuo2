import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";

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

        const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
        if (!ANTHROPIC_API_KEY) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }

        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

        const effectiveTotalFrames = totalFrameCount > 0 ? totalFrameCount : (frameUrls.length + startIndex);
        const frameDuration = videoDuration > 0 ? videoDuration / Math.max(effectiveTotalFrames, 1) : 10;

        console.log(`[extract-frame-text] Processing ${frameUrls.length} frames using Claude Haiku...`);

        // Process in parallel with concurrency limit of 5 to avoid rate limits
        const CONCURRENCY = 5;
        const results: FrameAnalysis[] = [];

        for (let batch = 0; batch < frameUrls.length; batch += CONCURRENCY) {
            const batchUrls = frameUrls.slice(batch, batch + CONCURRENCY);

            const batchResults = await Promise.all(batchUrls.map(async (frameUrl: string, i: number) => {
                const frameIndex = startIndex + batch + i;
                const timestamp = frameIndex * frameDuration;
                let lastError = null;

                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        const response = await client.messages.create({
                            model: "claude-haiku-4-5-20251001",
                            max_tokens: 512,
                            messages: [
                                {
                                    role: "user",
                                    content: [
                                        {
                                            type: "image",
                                            source: {
                                                type: "url",
                                                url: frameUrl,
                                            },
                                        },
                                        {
                                            type: "text",
                                            text: `Extract all visible text from this video frame and classify the content.${transcriptContext ? ` Context: "${transcriptContext.substring(0, 200)}"` : ''}

Return ONLY valid JSON:
{
  "text": "all visible text on screen, word for word",
  "ocr_confidence": 0.0-1.0,
  "ui_state": "slide|code|ui|talking_head|demonstration",
  "visualDescription": "one sentence describing what is shown",
  "emphasisFlags": {
    "highlight_detected": false,
    "cursor_pause": false,
    "zoom_focus": false,
    "text_selected": false,
    "lingering_frame": false,
    "bold_text": false,
    "underline_detected": false
  },
  "keyElements": ["key", "elements"],
  "instructorIntent": "what is being taught here",
  "dependsOnPrevious": false
}`,
                                        },
                                    ],
                                },
                            ],
                        });

                        const raw = response.content[0].type === 'text' ? response.content[0].text : '';
                        let resultText = raw.trim();

                        // Strip markdown code fences if present
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
                            ocr_confidence: parsed.ocr_confidence ?? 0.8,
                            ui_state: parsed.ui_state || 'unknown',
                            visualDescription: parsed.visualDescription || '',
                            textType: (parsed.ui_state || 'other') as FrameAnalysis['textType'],
                            emphasisFlags: {
                                highlight_detected: !!(parsed.emphasisFlags?.highlight_detected),
                                cursor_pause: !!(parsed.emphasisFlags?.cursor_pause),
                                zoom_focus: !!(parsed.emphasisFlags?.zoom_focus),
                                text_selected: !!(parsed.emphasisFlags?.text_selected),
                                lingering_frame: !!(parsed.emphasisFlags?.lingering_frame),
                                bold_text: !!(parsed.emphasisFlags?.bold_text),
                                underline_detected: !!(parsed.emphasisFlags?.underline_detected),
                            },
                            keyElements: parsed.keyElements || [],
                            instructorIntent: parsed.instructorIntent || '',
                            prosody: parsed.prosody || { tone: 'neutral', pacing: 'normal', volume: 'normal', parenthetical: '' },
                            dependsOnPrevious: !!parsed.dependsOnPrevious,
                        } as FrameAnalysis;

                    } catch (error) {
                        lastError = error;
                        console.error(`[extract-frame-text] Attempt ${attempt + 1} failed for frame ${frameIndex}:`, error);
                        if (attempt < maxRetries) {
                            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        }
                    }
                }

                if (allowPartialResults) {
                    return {
                        frameIndex,
                        timestamp,
                        text: '',
                        ocr_confidence: 0,
                        ui_state: 'error',
                        textType: 'other' as FrameAnalysis['textType'],
                        emphasisFlags: { highlight_detected: false, cursor_pause: false, zoom_focus: false, text_selected: false, lingering_frame: false, bold_text: false, underline_detected: false },
                        keyElements: [],
                        instructorIntent: '',
                        visualDescription: '',
                        prosody: { tone: 'neutral', pacing: 'normal', volume: 'normal', parenthetical: '' },
                        dependsOnPrevious: false,
                    } as FrameAnalysis;
                } else {
                    throw lastError || new Error(`Failed to analyze frame ${frameIndex}`);
                }
            }));

            results.push(...batchResults);
        }

        console.log(`[extract-frame-text] Done: ${results.length} frames analyzed`);

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
