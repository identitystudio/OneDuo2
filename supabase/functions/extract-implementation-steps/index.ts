import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Extract Implementation Steps
 * 
 * Hybrid Approach: AI proposes steps from frames/transcript, human approves each.
 * Part of the OneDuo Implementation Layer.
 * 
 * Extracts:
 * - Exact steps with sequence
 * - Conditional logic (if X → then Y)
 * - Constraints and gotchas
 * - Prerequisites
 */

interface FrameData {
  id: string;
  frame_index: number;
  timestamp_ms: number;
  ocr_text: string | null;
  confidence_score: number;
  is_critical: boolean;
}

interface ExtractedStep {
  step_number: number;
  step_title: string;
  step_description: string;
  source_frame_id: string | null;
  timestamp_start_ms: number;
  timestamp_end_ms: number;
  extraction_confidence: number;
  dependencies: {
    prerequisite_step_number: number;
    dependency_type: 'prerequisite' | 'conditional' | 'blocking' | 'recommended';
    condition_description?: string;
  }[];
  constraints: {
    constraint_type: 'prerequisite' | 'warning' | 'exception' | 'timing' | 'order' | 'environment' | 'validation';
    constraint_title: string;
    constraint_description: string;
    severity: 'info' | 'warning' | 'critical';
    source_text?: string;
  }[];
}

interface IntelligenceLayers {
  key_moments_index: {
    timestamp: string;
    description: string;
    importance: 'high' | 'medium' | 'low';
  }[];
  concepts_frameworks: {
    title: string;
    description: string;
    application: string;
  }[];
  hidden_patterns: {
    title: string;
    description: string;
    insight_type: 'persuasion' | 'psychology' | 'efficiency' | 'strategy';
  }[];
}

interface ExtractedData {
  steps: ExtractedStep[];
  intelligence_layers: IntelligenceLayers;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { artifact_id } = await req.json();

    if (!artifact_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameter: artifact_id'
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[extract-implementation-steps] Processing artifact: ${artifact_id}`);

    // Fetch artifact and frames
    const { data: artifact, error: artifactError } = await supabase
      .from("transformation_artifacts")
      .select("*")
      .eq("id", artifact_id)
      .single();

    if (artifactError || !artifact) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Artifact not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch frames with high confidence (focus on clear instructional moments)
    const { data: frames, error: framesError } = await supabase
      .from("artifact_frames")
      .select("id, frame_index, timestamp_ms, ocr_text, confidence_score, is_critical")
      .eq("artifact_id", artifact_id)
      .gte("confidence_score", 0.5) // Only consider medium+ confidence
      .order("frame_index", { ascending: true });

    if (framesError || !frames) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Error fetching frames'
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[extract-implementation-steps] Analyzing ${frames.length} frames`);

    // Prepare frame context for AI analysis
    const frameContext = frames.map((f: FrameData) => ({
      index: f.frame_index,
      time_ms: f.timestamp_ms,
      text: f.ocr_text || '',
      confidence: f.confidence_score,
      critical: f.is_critical
    }));

    // Use OpenAI to extract structured implementation steps
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const extractionPrompt = `You are ONEDUO — an execution intelligence system.

Your job is to transform unstructured content into structured, actionable systems and deep intelligence layers.

### TASK 1: ACTIONABLE STEPS (Layer C)
Extract a structured implementation sequence. For each step:
1. Title: Clear action verb + specific target
2. Description: Exact instructions with specific UI elements, values, or patterns
3. Timing: Provide timestamp ranges [MM:SS] and reference frame indices
4. Dependencies: Logic-based order (if X then Y)
5. Constraints: Warnings, prerequisites, and validations

### TASK 2: KEY MOMENTS INDEX (Layer A)
Identify the most significant "anchor points" in the video.
- Timestamp: [MM:SS]
- Description: What makes this moment critical (e.g., "The fundamental pivot", "Decision point for X")
- Importance: high/medium/low

### TASK 3: CONCEPTS & FRAMEWORKS (Layer B)
Extract formal models, strategies, or repeatable ideas presented.
- Title: Name of the concept
- Description: Detailed breakdown of how the model works
- Application: How the user can apply this outside of this specific context

### TASK 4: HIDDEN PATTERNS & INSIGHTS (Layer D)
Analyze the "subtext" and advanced strategies.
- Title: The insight/pattern name
- Description: How they are using persuasion, psychological triggers, or structural efficiency
- Insight Type: persuasion/psychology/efficiency/strategy

---

VIDEO TITLE: ${artifact.video_title || 'Untitled'}
DURATION: ${artifact.duration_seconds || 0} seconds

FRAME DATA (index, timestamp_ms, detected_text):
${JSON.stringify(frameContext, null, 2)}

Return a JSON object with this exact structure:
{
  "steps": [
    {
      "step_number": 1,
      "step_title": "...",
      "step_description": "...",
      "source_frame_index": 0,
      "timestamp_start_ms": 0,
      "timestamp_end_ms": 3000,
      "extraction_confidence": 0.9,
      "dependencies": [],
      "constraints": []
    }
  ],
  "intelligence_layers": {
    "key_moments_index": [
      { "timestamp": "02:15", "description": "...", "importance": "high" }
    ],
    "concepts_frameworks": [
      { "title": "...", "description": "...", "application": "..." }
    ],
    "hidden_patterns": [
      { "title": "...", "description": "...", "insight_type": "strategy" }
    ]
  }
}

RULES:
- Extract ONLY from provided frame data (OCR) and context
- Be build-ready. Avoid fluff.
- Maintain high precision for timestamps
- Focus on the "HOW" more than the "WHAT"`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You extract structured implementation steps from video frames. Output valid JSON only." },
          { role: "user", content: extractionPrompt }
        ],
        temperature: 0.3, // Lower temperature for structured extraction
        max_tokens: 4096,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[extract-implementation-steps] AI API error:`, errorText);
      throw new Error(`AI extraction failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || '';

    // Parse the AI response
    let extractedSteps: ExtractedStep[] = [];
    let intelligenceLayers: IntelligenceLayers = {
      key_moments_index: [],
      concepts_frameworks: [],
      hidden_patterns: []
    };

    try {
      // Handle markdown code blocks
      let jsonContent = responseContent;
      const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonContent);
      extractedSteps = (parsed.steps || parsed) as ExtractedStep[];
      if (parsed.intelligence_layers) {
        intelligenceLayers = parsed.intelligence_layers;
      }
    } catch (parseError) {
      console.error(`[extract-implementation-steps] Failed to parse AI response:`, parseError);
      console.log(`[extract-implementation-steps] Raw response:`, responseContent);

      // Fallback: create basic steps from critical frames
      extractedSteps = frames
        .filter((f: FrameData) => f.is_critical || f.confidence_score > 0.7)
        .map((f: FrameData, idx: number) => ({
          step_number: idx + 1,
          step_title: `Step ${idx + 1}: ${(f.ocr_text || '').slice(0, 50) || 'Untitled Step'}`,
          step_description: f.ocr_text || 'Review frame for details',
          source_frame_id: f.id,
          timestamp_start_ms: f.timestamp_ms,
          timestamp_end_ms: f.timestamp_ms + 3000,
          extraction_confidence: f.confidence_score * 0.8, // Reduce confidence for fallback
          dependencies: [],
          constraints: []
        }));
    }

    console.log(`[extract-implementation-steps] Extracted ${extractedSteps.length} steps and intelligence layers`);

    // Update artifact with intelligence layers
    const { error: artifactUpdateError } = await supabase
      .from("transformation_artifacts")
      .update({
        key_moments_index: intelligenceLayers.key_moments_index,
        concepts_frameworks: intelligenceLayers.concepts_frameworks,
        hidden_patterns: intelligenceLayers.hidden_patterns
      })
      .eq("id", artifact_id);

    if (artifactUpdateError) {
      console.error(`[extract-implementation-steps] Failed to update artifact:`, artifactUpdateError);
    }

    // Map frame indices to frame IDs
    const frameIndexToId = new Map(frames.map((f: FrameData) => [f.frame_index, f.id]));

    // Insert steps into database (all as 'proposed' - awaiting human approval)
    const insertedSteps: { stepNumber: number; stepId: string }[] = [];

    for (const step of extractedSteps) {
      const sourceFrameId = step.source_frame_id ||
        frameIndexToId.get((step as unknown as { source_frame_index?: number }).source_frame_index || 0) ||
        null;

      const { data: insertedStep, error: insertError } = await supabase
        .from("implementation_steps")
        .insert({
          artifact_id,
          step_number: step.step_number,
          step_title: step.step_title,
          step_description: step.step_description,
          source_frame_id: sourceFrameId,
          timestamp_start_ms: step.timestamp_start_ms,
          timestamp_end_ms: step.timestamp_end_ms,
          extracted_by: 'ai',
          extraction_confidence: Math.min(1, Math.max(0, step.extraction_confidence || 0.7)),
          approval_status: 'proposed', // HYBRID: AI proposes, human approves
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(`[extract-implementation-steps] Failed to insert step ${step.step_number}:`, insertError);
        continue;
      }

      insertedSteps.push({ stepNumber: step.step_number, stepId: insertedStep.id });

      // Insert constraints for this step
      if (step.constraints && step.constraints.length > 0) {
        for (const constraint of step.constraints) {
          await supabase.from("step_constraints").insert({
            step_id: insertedStep.id,
            constraint_type: constraint.constraint_type,
            constraint_title: constraint.constraint_title,
            constraint_description: constraint.constraint_description,
            severity: constraint.severity || 'warning',
            source_text: constraint.source_text,
            extraction_confidence: step.extraction_confidence,
            approval_status: 'proposed',
          });
        }
      }
    }

    // Insert dependencies (after all steps are created)
    const stepNumberToId = new Map(insertedSteps.map(s => [s.stepNumber, s.stepId]));

    for (const step of extractedSteps) {
      const dependentStepId = stepNumberToId.get(step.step_number);
      if (!dependentStepId || !step.dependencies) continue;

      for (const dep of step.dependencies) {
        const prerequisiteStepId = stepNumberToId.get(dep.prerequisite_step_number);
        if (!prerequisiteStepId) continue;

        await supabase.from("step_dependencies").insert({
          dependent_step_id: dependentStepId,
          prerequisite_step_id: prerequisiteStepId,
          dependency_type: dep.dependency_type,
          condition_description: dep.condition_description,
          approval_status: 'proposed',
        });
      }
    }

    // Log extraction event to reasoning_logs (anchored to governance layer)
    await supabase.from("reasoning_logs").insert({
      artifact_id,
      source_type: 'AI',
      source_label: 'Implementation Extractor',
      source_role: 'Analyst',
      analysis_focus: 'Step Extraction',
      summary: `Extracted ${insertedSteps.length} implementation steps from ${frames.length} frames`,
      concern_level: 'None',
      recommendation: `Review and approve ${insertedSteps.length} proposed steps before they become enforceable`,
      human_decision: 'Pending',
    });

    console.log(`[extract-implementation-steps] Successfully extracted ${insertedSteps.length} steps`);

    return new Response(JSON.stringify({
      success: true,
      artifact_id,
      steps_extracted: insertedSteps.length,
      steps: insertedSteps,
      message: 'Steps extracted and awaiting human approval (Hybrid Approach)'
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[extract-implementation-steps] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
