import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FrameAnalysis {
  frameIndex: number;
  timestamp: number;
  instructorIntent: string;
  emphasisFlags: {
    highlight_detected: boolean;
    cursor_pause: boolean;
    zoom_focus: boolean;
    text_selected: boolean;
    lingering_frame: boolean;
  };
  dependsOnPrevious?: boolean;
}

interface WorkflowStep {
  stepNumber: number;
  description: string;
  frameIndices: number[];
  mustNotSkip: boolean;
  dependsOn: number[];
  confidenceLevel: 'explicit' | 'strong' | 'inferred';
  signals: string[];
}

interface WorkflowSequence {
  sequenceId: string;
  title: string;
  steps: WorkflowStep[];
  criticalPath: number[];
  sequenceWarnings: string[];
}

interface SequenceAnalysisResult {
  workflows: WorkflowSequence[];
  dependencyChains: { stepA: number; stepB: number; relationship: string }[];
  overallSummary: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const {
      frameAnalyses,
      videoDuration = 0,
      transcript = [],
    } = await req.json();

    if (!frameAnalyses || !Array.isArray(frameAnalyses)) {
      throw new Error('frameAnalyses array is required');
    }

    const GEMINI_API_KEY = "AIzaSyCEs2qXfxlEz2mimTf8a1YoDT8ahOCxpjU";
    console.log(`[analyze-workflow-sequence] Using Gemini 2.5 Flash for ${frameAnalyses.length} frames...`);

    const validFrames = frameAnalyses.filter(f => f !== null);
    const frameSummaries = validFrames.map(f => ({
      idx: f.frameIndex,
      ts: f.timestamp,
      intent: f.instructorIntent,
      emphasis: f.emphasisFlags,
      dependsOnPrev: f.dependsOnPrevious || false,
    }));

    const systemPrompt = `You are ONEDUO — an execution intelligence system.
Analyze the frame sequence data to identify:
1. WORKFLOWS: Groups of related steps that form a complete process
2. DEPENDENCIES: Which steps require previous steps to be completed first
3. CRITICAL PATH: Steps that absolutely must not be skipped
4. SEQUENCE WARNINGS: Where order matters and why

Return ONLY valid JSON in this format:
{
  "workflows": [
    {
      "sequenceId": "workflow_1",
      "title": "Title",
      "steps": [
        {
          "stepNumber": 1,
          "description": "description",
          "frameIndices": [0, 1, 2],
          "mustNotSkip": true,
          "dependsOn": [],
          "confidenceLevel": "explicit|strong|inferred",
          "signals": ["highlight", "verbal_critical", "lingering"]
        }
      ],
      "criticalPath": [1],
      "sequenceWarnings": ["Warnings"]
    }
  ],
  "dependencyChains": [],
  "overallSummary": "Summary"
}`;

    const userPrompt = `Analyze these ${validFrames.length} frames. Detect workflows and critical steps.
Frame Data: ${JSON.stringify(frameSummaries)}
Transcript: ${JSON.stringify(transcript.slice(0, 20))}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        system_instruction: { parts: [{ text: systemPrompt }] },
        generation_config: { response_mime_type: "application/json" }
      }),
    });

    if (!response.ok) throw new Error(`AI analysis failed: ${response.status}`);
    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());

    console.log(`[analyze-workflow-sequence] Sequence analyzed via Gemini 2.5 Flash`);

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
