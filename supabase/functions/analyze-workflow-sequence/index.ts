import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

interface WorkflowStep {
  stepNumber: number;
  description: string;
  frameIndices: number[];
  timestamps: { start: number; end: number };
  mustNotSkip: boolean;
  dependsOn: number[];
  confidenceLevel: 'explicit' | 'strong' | 'inferred';
  signals: string[];
  dwellTime: number; // How long instructor stayed on this step
}

interface WorkflowSequence {
  sequenceId: string;
  title: string;
  steps: WorkflowStep[];
  totalDuration: number;
  criticalPath: number[]; // Step numbers that must not be skipped
  sequenceWarnings: string[];
}

interface SequenceAnalysisResult {
  workflows: WorkflowSequence[];
  criticalSteps: {
    frameIndex: number;
    timestamp: number;
    reason: string;
    confidenceLevel: string;
  }[];
  dependencyChains: {
    stepA: number;
    stepB: number;
    relationship: string;
  }[];
  summary: {
    totalWorkflows: number;
    totalCriticalSteps: number;
    averageConfidence: number;
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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log(`[analyze-workflow-sequence] Analyzing ${frameAnalyses.length} frames for workflow patterns`);

    // Filter out null frames
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

    // Group frames into sequences (every 5-7 frames)
    const sequenceSize = 6;
    const sequences: FrameAnalysis[][] = [];
    for (let i = 0; i < validFrames.length; i += sequenceSize) {
      sequences.push(validFrames.slice(i, i + sequenceSize));
    }

    console.log(`[analyze-workflow-sequence] Created ${sequences.length} frame sequences for analysis`);

    // Prepare summarized frame data for AI analysis
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

    // Use AI to analyze workflow patterns across frames
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are ONEDUO — an execution intelligence system.

Your job is to transform unstructured content into structured, actionable systems that can be immediately implemented.

For every analysis you must:
- Extract executable workflows (step-by-step processes that can be followed or automated)
- Identify decision logic (if this → then that rules)
- Convert knowledge into build-ready instructions
- Surface reusable frameworks, templates, and repeatable patterns

Always organize outputs into:
1. **Workflow** - The step-by-step execution path
2. **Automation Opportunities** - What can be systematized
3. **Build Instructions** - Implementation-ready details
4. **Key Logic & Rules** - The if/then decision trees
5. **Reusable Assets** - Templates, frameworks, patterns

**DO NOT summarize. DO NOT paraphrase for understanding only.**
Your goal is **speed to implementation**.

---

Analyze the frame sequence data to identify:
1. WORKFLOWS: Groups of related steps that form a complete process
2. DEPENDENCIES: Which steps require previous steps to be completed first
3. CRITICAL PATH: Steps that absolutely must not be skipped
4. SEQUENCE WARNINGS: Where order matters and why

For each workflow detected, identify:
- Start and end frame indices
- Which steps depend on which
- The dwell time (how many frames = more emphasis)
- Confidence level based on signals

Return ONLY valid JSON in this format:
{
  "workflows": [
    {
      "sequenceId": "workflow_1",
      "title": "Setting up the voice bot",
      "steps": [
        {
          "stepNumber": 1,
          "description": "Navigate to dashboard",
          "frameIndices": [0, 1, 2],
          "mustNotSkip": true,
          "dependsOn": [],
          "confidenceLevel": "explicit|strong|inferred",
          "signals": ["highlight", "verbal_critical", "lingering"]
        }
      ],
      "criticalPath": [1, 3, 5],
      "sequenceWarnings": ["Steps 1-3 must be done in order because..."]
    }
  ],
  "dependencyChains": [
    { "stepA": 1, "stepB": 2, "relationship": "stepB requires stepA completion" }
  ],
  "overallSummary": "This content contains X workflows with Y critical steps..."
}`
          },
          {
            role: 'user',
            content: `Analyze these ${validFrames.length} frames from a ${Math.round(videoDuration / 60)} minute training video. Detect workflows, dependencies, and critical steps.

Frame Data (idx=index, ts=timestamp seconds, intent=instructor intent, emphasis=visual emphasis flags):
${JSON.stringify(frameSummaries, null, 1)}

Transcript snippets for context:
${transcript.slice(0, 20).map((t: { start: number; text: string }) => `[${Math.round(t.start)}s] ${t.text?.substring(0, 80)}`).join('\n')}

Return JSON with detected workflows and critical steps.`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[analyze-workflow-sequence] AI request failed: ${response.status}`);
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let analysisResult: Partial<SequenceAnalysisResult>;

    try {
      let jsonStr = content;
      if (content.includes('```json')) {
        jsonStr = content.split('```json')[1].split('```')[0].trim();
      } else if (content.includes('```')) {
        jsonStr = content.split('```')[1].split('```')[0].trim();
      }

      const parsed = JSON.parse(jsonStr);

      // Calculate additional metrics
      const workflows: WorkflowSequence[] = (parsed.workflows || []).map((w: any, idx: number) => {
        const steps = (w.steps || []).map((s: any, sIdx: number) => {
          const frameIndices = s.frameIndices || [];
          const firstFrame = validFrames.find(f => frameIndices.includes(f.frameIndex));
          const lastFrame = validFrames.filter(f => frameIndices.includes(f.frameIndex)).pop();

          return {
            stepNumber: s.stepNumber || sIdx + 1,
            description: s.description || '',
            frameIndices,
            timestamps: {
              start: firstFrame?.timestamp || 0,
              end: lastFrame?.timestamp || 0,
            },
            mustNotSkip: s.mustNotSkip || false,
            dependsOn: s.dependsOn || [],
            confidenceLevel: s.confidenceLevel || 'inferred',
            signals: s.signals || [],
            dwellTime: frameIndices.length * (videoDuration / Math.max(validFrames.length, 1)),
          } as WorkflowStep;
        });

        return {
          sequenceId: w.sequenceId || `workflow_${idx + 1}`,
          title: w.title || `Workflow ${idx + 1}`,
          steps,
          totalDuration: steps.reduce((sum: number, s: WorkflowStep) => sum + s.dwellTime, 0),
          criticalPath: w.criticalPath || steps.filter((s: WorkflowStep) => s.mustNotSkip).map((s: WorkflowStep) => s.stepNumber),
          sequenceWarnings: w.sequenceWarnings || [],
        } as WorkflowSequence;
      });

      // Extract critical steps from frame data
      const criticalSteps = validFrames
        .filter(f => f.mustNotSkip || f.intentConfidence > 0.7)
        .map(f => ({
          frameIndex: f.frameIndex,
          timestamp: f.timestamp,
          reason: f.mustNotSkip
            ? 'Multiple signals indicate critical step'
            : `High confidence intent (${(f.intentConfidence * 100).toFixed(0)}%)`,
          confidenceLevel: f.intentSource || 'inferred',
        }));

      // Calculate average confidence
      const avgConfidence = validFrames.length > 0
        ? validFrames.reduce((sum, f) => sum + (f.intentConfidence || 0), 0) / validFrames.length
        : 0;

      analysisResult = {
        workflows,
        criticalSteps,
        dependencyChains: parsed.dependencyChains || [],
        summary: {
          totalWorkflows: workflows.length,
          totalCriticalSteps: criticalSteps.length,
          averageConfidence: avgConfidence,
        },
      };

    } catch (parseError) {
      console.error('[analyze-workflow-sequence] Failed to parse AI response:', parseError);

      // Fallback: Build basic workflow from frame data alone
      const criticalSteps = validFrames
        .filter(f => f.mustNotSkip || f.intentConfidence > 0.7)
        .map(f => ({
          frameIndex: f.frameIndex,
          timestamp: f.timestamp,
          reason: f.mustNotSkip ? 'Multiple signals' : 'High confidence',
          confidenceLevel: f.intentSource || 'inferred',
        }));

      analysisResult = {
        workflows: [],
        criticalSteps,
        dependencyChains: [],
        summary: {
          totalWorkflows: 0,
          totalCriticalSteps: criticalSteps.length,
          averageConfidence: validFrames.reduce((sum, f) => sum + (f.intentConfidence || 0), 0) / validFrames.length,
        },
      };
    }

    console.log(`[analyze-workflow-sequence] Detected ${analysisResult.workflows?.length || 0} workflows, ${analysisResult.criticalSteps?.length || 0} critical steps`);

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[analyze-workflow-sequence] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
