import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

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

    const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') || Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    console.log(`[analyze-audio-events] Analyzing audio events via Replicate for: ${videoUrl.substring(0, 80)}...`);

    // Build transcript context for better audio event inference
    const transcriptContext = transcript && transcript.length > 0
      ? transcript.map(seg => `[${formatTime(seg.start)}] "${seg.text}"`).join('\n')
      : 'No transcript available';

    if (!transcript || transcript.length === 0) {
      console.warn("[analyze-audio-events] WARNING: Received empty transcript. AI inference will be limited.");
    }

    const durationInfo = videoDuration
      ? `${Math.floor(videoDuration / 60)}m ${Math.floor(videoDuration % 60)}s`
      : 'Unknown duration';

    const systemPrompt = `You are an expert audio analyst for film and video production, specializing in screenplay-style audio annotation. Analyze non-speech audio events (Music Cues, Ambient Sounds, Reactions, Meaningful Pauses). Return valid JSON.`;

    const userPrompt = `Analyze the audio events for this video:
Video: ${courseTitle || 'Untitled'}
URL: ${videoUrl}
Duration: ${durationInfo}
Transcript Context (use this to infer timing):
${transcriptContext}

Return valid JSON:
{
  "music_cues": [{ "start": number, "end": number, "mood": "string", "genre": "string", "description": "string" }],
  "ambient_sounds": [{ "timestamp": number, "duration": number, "sound": "string", "meaning": "string" }],
  "reactions": [{ "timestamp": number, "duration": number, "type": "string", "context": "string", "intensity": "string" }],
  "meaningful_pauses": [{ "timestamp": number, "duration": number, "meaning": "string", "screenplayNote": "string" }],
  "overall_audio_mood": "string"
}`;

    console.log(`[analyze-audio-events] Calling Replicate with model: meta/meta-llama-3-70b-instruct`);

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

    console.log(`[analyze-audio-events] Replicate call successful. Output type: ${typeof output}`);

    const content = Array.isArray(output) ? output.join('') : String(output);

    // Parse the JSON response
    let audioEvents: AudioEventsResult;
    try {
      let cleanContent = content;
      if (cleanContent.includes('```json')) {
        cleanContent = cleanContent.split('```json')[1].split('```')[0].trim();
      } else if (cleanContent.includes('```')) {
        cleanContent = cleanContent.split('```')[1].split('```')[0].trim();
      }
      audioEvents = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error('[analyze-audio-events] Failed to parse Replicate response:', parseError);
      console.log('[analyze-audio-events] Raw content:', content.substring(0, 1000));
      throw new Error("REPLICATE_FORMAT_ERROR: AI response was not valid JSON");
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

    // SUCCESS LOG AS REQUESTED
    console.log(`[analyze-audio-events] SUCCESS: Audio event mapping complete. Detected ${totalEvents} total audio events.`);

    return new Response(
      JSON.stringify({
        success: true,
        ...audioEvents,
        debug: {
          transcriptLength: transcript?.length || 0,
          replicateModel: "meta/llama-3-70b-instruct"
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-audio-events] ERROR:', error);
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
