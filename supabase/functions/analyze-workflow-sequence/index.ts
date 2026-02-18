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
    textType: string;
    instructorIntent: string;
    intentConfidence: number;
    intentSource: string;
    mustNotSkip: boolean;
    dependsOnPrevious: boolean;
    emphasisFlags: {
        highlight_detected: boolean;
        cursor_pause: boolean;
        zoom_focus: boolean;
        text_selected: boolean;
        lingering_frame: boolean;
        bold_text: boolean;
        underline_detected: boolean;
    };
    prosody?: {
        tone: string;
        pacing: string;
        volume: string;
        parenthetical: string;
    };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { frameAnalyses, transcript = [], videoDuration = 0 } = await req.json();

        if (!frameAnalyses || !Array.isArray(frameAnalyses)) {
            throw new Error('frameAnalyses array is required');
        }

        const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN") || Deno.env.get("REPLICATE_API_KEY");
        if (!REPLICATE_API_TOKEN) {
            throw new Error('REPLICATE_API_TOKEN is not configured');
        }

        const replicate = new Replicate({
            auth: REPLICATE_API_TOKEN,
        });

        const validFrames = frameAnalyses.filter((f: FrameAnalysis | null) => f !== null) as FrameAnalysis[];

        if (validFrames.length === 0) {
            return new Response(JSON.stringify({
                workflows: [],
                criticalSteps: [],
                dependencyChains: [],
                summary: { totalWorkflows: 0, totalCriticalSteps: 0, averageConfidence: 0 }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const frameSummaries = validFrames.map(f => ({
            idx: f.frameIndex,
            ts: Math.round(f.timestamp),
            intent: f.instructorIntent?.substring(0, 100) || '',
            type: f.textType,
            emphasis: Object.entries(f.emphasisFlags || {}).filter(([_, v]) => v).map(([k]) => k).join(','),
            confidence: f.intentConfidence || 0,
            mustNotSkip: f.mustNotSkip || false,
            dependsOnPrev: f.dependsOnPrevious || false,
        }));

        const systemPrompt = `You are ONEDUO — an execution intelligence system.
Your goal is to transform frame analysis data into structured, executable workflows.

Extract:
1. Workflows (step-by-step processes)
2. Critical Path (steps that MUST be done)
3. Dependency Chains (Step B requires Step A)

Respond ONLY in this JSON format:
{
  "workflows": [
    {
      "sequenceId": "wf_1",
      "title": "Short Descriptive Title",
      "steps": [
        {
          "stepNumber": 1,
          "description": "Clear instruction",
          "frameIndices": [0, 1],
          "timestamps": { "start": 0, "end": 10 },
          "mustNotSkip": boolean,
          "dependsOn": [],
          "confidenceLevel": "explicit|strong|inferred",
          "signals": ["visual cues used"],
          "dwellTime": number
        }
      ],
      "totalDuration": number,
      "criticalPath": [1, 3],
      "sequenceWarnings": ["Warnings for this sequence"]
    }
  ],
  "dependencyChains": [
    { "stepA": 1, "stepB": 2, "relationship": "B depends on A" }
  ],
  "overallSummary": "Summary of detected execution paths"
}`;

        const userPrompt = `Analyze these ${validFrames.length} frames from a video.
        
        Frame Data:
        ${JSON.stringify(frameSummaries)}
        
        Transcript Context:
        ${transcript.slice(0, 10).map((t: any) => t.text).join(' ')}`;

        const output = await replicate.run(
            "meta/llama-2-70b-chat:02e509c7899648321286b73a21cee29153523eab4a2927883e03107860a48d01",
            {
                input: {
                    prompt: `${systemPrompt}\n\n${userPrompt}`,
                    max_new_tokens: 2000,
                    temperature: 0.1
                }
            }
        );

        let resultText = Array.isArray(output) ? output.join('') : String(output);

        // Basic JSON extraction
        if (resultText.includes('```json')) {
            resultText = resultText.split('```json')[1].split('```')[0].trim();
        } else if (resultText.includes('{')) {
            resultText = resultText.substring(resultText.indexOf('{'), resultText.lastIndexOf('}') + 1);
        }

        const parsed = JSON.parse(resultText);

        return new Response(JSON.stringify({
            workflows: parsed.workflows || [],
            criticalSteps: parsed.criticalSteps || [],
            dependencyChains: parsed.dependencyChains || [],
            summary: {
                totalWorkflows: parsed.workflows?.length || 0,
                totalCriticalSteps: parsed.criticalSteps?.length || 0,
                averageConfidence: 0.8 // Heuristic
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('[analyze-workflow-sequence] Error:', error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
