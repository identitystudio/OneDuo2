import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MusicCue {
  start: number;
  end: number;
  mood: string;
  genre?: string;
  description: string;
}

interface AmbientSound {
  timestamp: number;
  duration: number;
  sound: string;
  meaning: string;
}

interface AudienceReaction {
  timestamp: number;
  duration: number;
  type: 'laughter' | 'applause' | 'gasp' | 'murmur' | 'cheer' | 'other';
  context: string;
  intensity: 'subtle' | 'moderate' | 'strong';
}

interface MeaningfulPause {
  timestamp: number;
  duration: number;
  meaning: string;
  screenplayNote: string;
}

interface AudioEventsResult {
  music_cues: MusicCue[];
  ambient_sounds: AmbientSound[];
  reactions: AudienceReaction[];
  meaningful_pauses: MeaningfulPause[];
  overall_audio_mood: string;
}

interface AudioAnalysisRequest {
  videoUrl: string;
  transcript?: Array<{ start: number; end: number; text: string }>;
  videoDuration?: number;
  courseTitle?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, transcript, videoDuration, courseTitle }: AudioAnalysisRequest = await req.json();

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

    console.log(`[analyze-audio-events] Analyzing audio events for: ${videoUrl.substring(0, 80)}...`);

    // Build transcript context for better audio event inference
    const transcriptContext = transcript
      ? transcript.map(seg => `[${formatTime(seg.start)}] "${seg.text}"`).join('\n')
      : 'No transcript available';

    const durationInfo = videoDuration
      ? `${Math.floor(videoDuration / 60)}m ${Math.floor(videoDuration % 60)}s`
      : 'Unknown duration';

    const systemPrompt = `You are an expert audio analyst for film and video production, specializing in screenplay-style audio annotation.

Your task is to analyze a video and infer NON-SPEECH audio events that would be important for:
- Screenwriters who need to understand the full sensory experience
- AI assistants that need to recreate or reference the content
- Editors who need to understand audio timing and mood

Analyze and detect:

1. **MUSIC CUES** - Background music, jingles, theme songs
   - When music starts and ends
   - The mood (upbeat, somber, tense, triumphant, etc.)
   - Genre if identifiable
   - Purpose in context (building excitement, transition, emotional punctuation)

2. **AMBIENT SOUNDS** - Environmental audio that sets the scene
   - Birds chirping (morning, outdoor, peaceful)
   - Traffic noise (urban, busy)
   - Office sounds (professional environment)
   - Nature sounds (water, wind, etc.)
   - Room tone/atmosphere
   - Include the MEANING not just the sound

3. **AUDIENCE/PRESENTER REACTIONS** - Non-speech emotional sounds
   - Laughter (genuine, polite, nervous)
   - Applause (brief, sustained, enthusiastic)
   - Gasps or surprised reactions
   - Cheering or excitement
   - Context: what triggered the reaction

4. **MEANINGFUL PAUSES/SILENCES** - Intentional beats
   - Dramatic pauses for effect
   - Thinking pauses before important points
   - Transition silences between topics
   - Include screenplay-style parenthetical: "(beat)", "(long pause for emphasis)"

Return valid JSON with this structure:
{
  "music_cues": [
    { "start": <seconds>, "end": <seconds>, "mood": "string", "genre": "string|null", "description": "what the music conveys" }
  ],
  "ambient_sounds": [
    { "timestamp": <seconds>, "duration": <seconds>, "sound": "what is heard", "meaning": "screenplay interpretation" }
  ],
  "reactions": [
    { "timestamp": <seconds>, "duration": <seconds>, "type": "laughter|applause|gasp|murmur|cheer|other", "context": "what triggered it", "intensity": "subtle|moderate|strong" }
  ],
  "meaningful_pauses": [
    { "timestamp": <seconds>, "duration": <seconds>, "meaning": "purpose of the pause", "screenplayNote": "(beat) or (long pause)" }
  ],
  "overall_audio_mood": "brief summary of the audio landscape and emotional journey"
}

Be strategic - identify truly meaningful audio events, not every minor sound. Aim for:
- 2-8 music cues (if music is present)
- 3-10 ambient sounds
- 2-10 reactions (if audience/presenter reactions exist)
- 3-15 meaningful pauses

If there's no evidence of a category (e.g., no music, no audience), return an empty array for that category.`;

    const userPrompt = `Analyze the audio events for this video content:

Video: ${courseTitle || 'Untitled'}
URL: ${videoUrl}
Duration: ${durationInfo}

Transcript with timestamps (use this to infer WHEN audio events likely occur):
${transcriptContext}

Based on the content and context, identify:
1. Any music cues and their emotional purpose
2. Ambient sounds that set the scene
3. Reactions (laughter, applause, etc.) with their context
4. Meaningful pauses and their screenplay interpretation

Remember: Focus on audio that has MEANING - interpret it like a screenwriter would for director's notes.

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
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[analyze-audio-events] API error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    let audioEvents: AudioEventsResult;
    try {
      // Clean up potential markdown code blocks
      let cleanContent = content;
      if (cleanContent.includes('```json')) {
        cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (cleanContent.includes('```')) {
        cleanContent = cleanContent.replace(/```\s*/g, '');
      }
      audioEvents = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error('[analyze-audio-events] Failed to parse AI response:', parseError);
      console.log('[analyze-audio-events] Raw content:', content.substring(0, 500));

      // Return a minimal valid response
      audioEvents = {
        music_cues: [],
        ambient_sounds: [],
        reactions: [],
        meaningful_pauses: [],
        overall_audio_mood: 'Analysis inconclusive'
      };
    }

    // Validate and ensure all arrays exist
    audioEvents.music_cues = audioEvents.music_cues || [];
    audioEvents.ambient_sounds = audioEvents.ambient_sounds || [];
    audioEvents.reactions = audioEvents.reactions || [];
    audioEvents.meaningful_pauses = audioEvents.meaningful_pauses || [];

    const totalEvents = audioEvents.music_cues.length +
      audioEvents.ambient_sounds.length +
      audioEvents.reactions.length +
      audioEvents.meaningful_pauses.length;

    console.log(`[analyze-audio-events] Detected ${totalEvents} total audio events:
      - Music cues: ${audioEvents.music_cues.length}
      - Ambient sounds: ${audioEvents.ambient_sounds.length}
      - Reactions: ${audioEvents.reactions.length}
      - Meaningful pauses: ${audioEvents.meaningful_pauses.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        ...audioEvents
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-audio-events] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
