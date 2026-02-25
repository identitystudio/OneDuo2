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

    const systemPrompt = `You are an empathic vocal analyst. You don't just hear audio; you hear the soul and intent behind the voice.
Analyze the speaker's vocal delivery (prosody) for each segment of this video transcript as if you were a psychologist or an expert drama coach.

Return valid JSON in this format:
{
  "annotations": [
    {
      "timestamp": number,
      "text": "string",
      "profile": {
        "speakingRate": "measured|fast|dynamic",
        "energyTrend": "rising|stable|subsiding",
        "volumeVariance": "whisper|normal|emphatic",
        "pitchVariance": "monotone|varied|musical",
        "toneClassification": "enthusiastic|cautious|instructive|uncertain|determined",
        "confidenceScore": 0-1,
        "engagementLevel": "passive|active|passionate",
        "authenticity": "scripted|spontaneous",
        "emotionalNote": "string (psychological interpretation of this specific segment)"
      }
    }
  ],
  "overall_tone": "The psychological 'weight' of the module",
  "breakthrough_moments": [number],
  "cliffhanger_moments": [number]
}`;

    const userPrompt = `Listen to the layers of this vocal performance.
Video URL: ${videoUrl}
Duration: ${videoDuration ? `${Math.floor(videoDuration / 60)}m ${videoDuration % 60}s` : 'Unknown'}
Transcript Context:
${transcriptContext}

ULTIMATE PEAK RULES:
1. Confidence & Engagement Matrix: Correlate pitch/volume rhythm to detect "searching for words" vs. "mastery".
2. Breakthrough Sensitivity: Identify when the voice shifts from technical to "Aha!" or "Eureka!" energy.
3. Authenticity Detection: Does the speaker sound like they are reading a script or teaching from living experience?
4. Narrative Weight: Distinguish between "routine setup" and "thematic crux" based on vocal intensity.`;

    console.log(`[analyze-audio-prosody] Calling Replicate with model: meta/meta-llama-3-70b-instruct`);

    const output = await replicate.run(
      "meta/meta-llama-3-70b-instruct",
      {
        input: {
          system_prompt: systemPrompt,
          prompt: userPrompt,
          max_new_tokens: 4096,
          temperature: 0.2
        }
      }
    ) as any;

    console.log(`[analyze - audio - prosody] Replicate call successful.Output type: ${typeof output} `);

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
