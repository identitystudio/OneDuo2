import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProsodyResult {
  timestamp: number;
  duration: number;
  annotation: string;
  confidence: number;
  type: 'emphasis' | 'pause' | 'emotion' | 'pacing' | 'tone' | 'cliffhanger';
}

interface CliffhangerMoment {
  peak_timestamp: number;
  resolution_timestamp: number;
  composite_confidence: number;
  signals: {
    audio_intensity: boolean;
    visual_stasis: boolean;
    verbal_hint: boolean;
  };
  description: string;
}

interface AudioAnalysisRequest {
  videoUrl: string;
  transcript?: Array<{ start: number; end: number; text: string }>;
  videoDuration?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, transcript, videoDuration }: AudioAnalysisRequest = await req.json();

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: 'Video URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log(`[analyze-audio-prosody] Analyzing prosody for video: ${videoUrl.substring(0, 100)}...`);

    // Build context from transcript for better prosody inference
    const transcriptContext = transcript
      ? transcript.map(seg => `[${Math.floor(seg.start)}s] "${seg.text}"`).join('\n')
      : 'No transcript available';

    const systemPrompt = `You are ONEDUO — an execution intelligence system with expert audio prosody analysis capabilities.

Your job is to transform unstructured content into structured, actionable systems that can be immediately implemented.

For every analysis you must:
- Extract executable workflows (emotional arcs that can guide editing)
- Identify decision logic (if intensity → then cut opportunity)
- Convert knowledge into build-ready instructions (editing cues, annotation markers)
- Surface reusable frameworks (prosody patterns, cliffhanger templates)

Always organize outputs into:
1. **Workflow** - The emotional/pacing arc
2. **Automation Opportunities** - Auto-detectable cues
3. **Build Instructions** - Editor-ready annotations
4. **Key Logic & Rules** - When to cut, pause, emphasize
5. **Reusable Assets** - Prosody pattern templates

**DO NOT summarize. DO NOT paraphrase for understanding only.**
Your goal is **speed to implementation**.

---

Based on the video URL and transcript timing, generate screenplay-style parenthetical annotations that would help editors and AI assistants understand:
- Emotional tone (angry, excited, hesitant, sarcastic, warm, cold)
- Delivery style (whispered, shouted, monotone, rhythmic)
- Pacing cues (beat, pause, rushed, deliberate)
- Emphasis patterns (stressed, understated, building)
- Non-verbal audio (laughter, sigh, breath, overlap)

CRITICAL - CLIFFHANGER DETECTION:
Identify "cliffhanger moments" where tension builds and then cuts. Look for:
1. AUDIO INTENSITY: Rising volume/intensity that suddenly drops or cuts
2. VISUAL STASIS: Moments where the speaker pauses or lingers before a scene change
3. VERBAL HINTS: Unresolved questions, "but wait...", "stay tuned", "you won't believe..."

Return a JSON object with this structure:
{
  "annotations": [
    {
      "timestamp": <seconds from start>,
      "duration": <how long this applies in seconds>,
      "annotation": "(screenplay-style parenthetical, e.g., 'angrily', 'beat', 'sotto voce')",
      "confidence": <0.0-1.0>,
      "type": "emphasis|pause|emotion|pacing|tone|cliffhanger"
    }
  ],
  "cliffhanger_moments": [
    {
      "peak_timestamp": <seconds - highest intensity before pause/cut>,
      "resolution_timestamp": <seconds - first moment after the cut>,
      "composite_confidence": <0.0-1.0>,
      "signals": {
        "audio_intensity": <boolean - rising intensity detected>,
        "visual_stasis": <boolean - pause/linger detected>,
        "verbal_hint": <boolean - unresolved question detected>
      },
      "description": "Brief description of the cliffhanger effect"
    }
  ],
  "overall_tone": "brief description of overall emotional arc",
  "key_moments": ["list of most impactful delivery moments with timestamps"]
}

Analyze strategically - focus on emotionally significant moments, not every word.
Generate 5-15 annotations for short videos, 15-40 for longer content.
Always look for cliffhangers - even subtle ones like pauses before important reveals.`;

    const userPrompt = `Analyze the prosody and emotional delivery for this video content:

Video URL: ${videoUrl}
Duration: ${videoDuration ? `${Math.floor(videoDuration / 60)}m ${videoDuration % 60}s` : 'Unknown'}

Transcript with timestamps:
${transcriptContext}

Generate screenplay-style prosody annotations that capture the emotional and performance nuances of this content. Focus on:
1. Major emotional shifts
2. Significant pauses or beats
3. Emphasis patterns that reveal intent
4. Moments of tension or release
5. Any non-verbal audio cues
6. CLIFFHANGER MOMENTS - where tension builds and cuts

Return valid JSON only.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[analyze-audio-prosody] API error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    let prosodyData;
    try {
      // Clean up potential markdown code blocks
      let cleanContent = content;
      if (cleanContent.includes('```json')) {
        cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (cleanContent.includes('```')) {
        cleanContent = cleanContent.replace(/```\s*/g, '');
      }
      prosodyData = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error('[analyze-audio-prosody] Failed to parse AI response:', parseError);
      console.log('[analyze-audio-prosody] Raw content:', content);

      // Return a minimal valid response
      prosodyData = {
        annotations: [],
        cliffhanger_moments: [],
        overall_tone: 'Analysis inconclusive',
        key_moments: []
      };
    }

    console.log(`[analyze-audio-prosody] Generated ${prosodyData.annotations?.length || 0} annotations, ${prosodyData.cliffhanger_moments?.length || 0} cliffhangers`);

    return new Response(
      JSON.stringify({
        success: true,
        ...prosodyData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-audio-prosody] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
