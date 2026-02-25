interface AudioProfile {
  speakingRateWPM: number;
  avgPauseDuration: number;
  longestPauseDuration: number;
  longestPauseTimestamp: number;
  silenceRatio: number;
  wordCount: number;
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

    const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') || Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    console.log(`[analyze-audio-prosody] Analyzing sensory prosody via Replicate for: ${videoUrl.substring(0, 80)}...`);

    // ============ PROSODY FEATURE CALCULATION (Linguistic) ============
    // Calculate precise WPM and pause metrics per segment
    const segmentProfiles: AudioProfile[] = transcript?.map((seg, idx) => {
      const duration = seg.end - seg.start;
      const words = seg.text.trim().split(/\s+/).filter(w => w.length > 0);
      const wpm = duration > 0 ? Math.round((words.length / duration) * 60) : 0;

      // Calculate gap between this and next segment for pause analysis
      let pauseAfter = 0;
      if (transcript[idx + 1]) {
        pauseAfter = Math.max(0, transcript[idx + 1].start - seg.end);
      }

      return {
        speakingRateWPM: wpm,
        avgPauseDuration: pauseAfter, // Basic for now, will refine with word-level if available
        longestPauseDuration: pauseAfter,
        longestPauseTimestamp: seg.end,
        silenceRatio: duration > 0 ? Math.min(100, Math.round((pauseAfter / (duration + pauseAfter)) * 100)) : 0,
        wordCount: words.length
      };
    }) || [];

    // Build context from transcript for better prosody inference
    const transcriptContext = transcript && transcript.length > 0
      ? transcript.map((seg, i) => {
        const profile = segmentProfiles[i];
        return `[${Math.floor(seg.start)}s - ${Math.floor(seg.end)}s] "${seg.text}" (Traits: ${profile.speakingRateWPM} WPM, ${profile.silenceRatio}% Silence)`;
      }).join('\n')
      : 'No transcript available';

    if (!transcript || transcript.length === 0) {
      console.warn("[analyze-audio-prosody] WARNING: Received empty transcript. Prosody mapping will be limited.");
    }

    const systemPrompt = `You are ONEDUO — an execution intelligence system with expert audio prosody analysis capabilities. Extract vocal prosody, emotional delivery, and energy trends from transcripts enriched with trait metadata. Return valid JSON only.`;

    const userPrompt = `Analyze the prosody, emotional delivery, and energy dynamics for this video:
URL: ${videoUrl}
Duration: ${videoDuration ? `${Math.floor(videoDuration / 60)}m ${videoDuration % 60}s` : 'Unknown'}

Input Segments with Meta-Traits:
${transcriptContext}

Return JSON with this structure:
{
  "annotations": [
    { 
      "timestamp": number, 
      "duration": number, 
      "annotation": "string", 
      "confidence": number, 
      "type": "emphasis|pause|emotion|pacing|tone|cliffhanger",
      "profile": {
        "speaking_rate": "string", // e.g. "158 WPM"
        "volume_variance": "Low|Moderate|High",
        "pitch_variance": "Low|Moderate|High",
        "energy_trend": "Rising|Stable|Declining",
        "tone_classification": "string"
      }
    }
  ],
  "cliffhanger_moments": [
    { "peak_timestamp": number, "resolution_timestamp": number, "composite_confidence": number, "signals": { "audio_intensity": boolean, "visual_stasis": boolean, "verbal_hint": boolean }, "description": "string" }
  ],
  "overall_tone": "string",
  "key_moments": ["string"]
}

Rules:
1. Ensure 'profile' exists for every segment annotation.
2. Normalize variance labels based on the metadata provided.
3. If no speech, use 'No vocal signal detected'.`;

    const output = await replicate.run(
      "meta/llama-3-70b-instruct",
      {
        input: {
          system_prompt: systemPrompt,
          prompt: userPrompt,
          max_new_tokens: 4096,
          temperature: 0.2
        }
      }
    ) as any;

    const content = Array.isArray(output) ? output.join('') : String(output);

    // Parse the JSON response
    let prosodyData;
    try {
      let cleanContent = content;
      if (cleanContent.includes('```json')) {
        cleanContent = cleanContent.split('```json')[1].split('```')[0].trim();
      } else if (cleanContent.includes('```')) {
        cleanContent = cleanContent.split('```')[1].split('```')[0].trim();
      }
      prosodyData = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error('[analyze-audio-prosody] Failed to parse Replicate response:', parseError);
      console.log('[analyze-audio-prosody] Raw content:', content.substring(0, 1000));
      throw new Error("REPLICATE_FORMAT_ERROR: AI response was not valid JSON");
    }

    // SUCCESS LOG AS REQUESTED
    console.log(`[analyze-audio-prosody] SUCCESS: Vocal prosody mapping complete. Generated ${prosodyData.annotations?.length || 0} annotations with signal depth.`);

    return new Response(
      JSON.stringify({
        success: true,
        ...prosodyData,
        debug: {
          transcriptLength: transcript?.length || 0,
          replicateModel: "meta/llama-3-70b-instruct",
          calculatedTraits: true
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-audio-prosody] ERROR:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
