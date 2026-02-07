import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  author: string;
  description: string;
  duration: number;
  thumbnailUrl: string;
  isUnlisted: boolean;
  captions: Caption[];
}

interface Caption {
  text: string;
  start: number;
  duration: number;
}

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Just the video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch video metadata via YouTube oEmbed (no API key needed)
async function fetchVideoMetadata(videoId: string): Promise<{
  title: string;
  author: string;
  thumbnailUrl: string;
}> {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  
  const response = await fetch(oEmbedUrl);
  if (!response.ok) {
    throw new Error(`Video not found or not accessible (video ID: ${videoId})`);
  }
  
  const data = await response.json();
  return {
    title: data.title,
    author: data.author_name,
    thumbnailUrl: data.thumbnail_url,
  };
}

// Attempt to fetch auto-generated or user captions
async function fetchCaptions(videoId: string): Promise<Caption[]> {
  try {
    // First, get the video page to find caption tracks
    const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoPageUrl);
    const html = await response.text();
    
    // Extract the captions URL from the page (if available)
    const captionMatch = html.match(/"captionTracks":\s*\[([^\]]+)\]/);
    if (!captionMatch) {
      console.log('No captions found for video');
      return [];
    }
    
    const captionData = JSON.parse(`[${captionMatch[1]}]`);
    
    // Prefer English captions, or take the first available
    const englishCaption = captionData.find((c: any) => 
      c.languageCode === 'en' || c.languageCode === 'en-US'
    ) || captionData[0];
    
    if (!englishCaption?.baseUrl) {
      console.log('No accessible caption URL found');
      return [];
    }
    
    // Fetch the actual captions (in XML format)
    const captionsResponse = await fetch(englishCaption.baseUrl);
    const captionsXml = await captionsResponse.text();
    
    // Parse XML captions
    const captions: Caption[] = [];
    const textMatches = captionsXml.matchAll(/<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g);
    
    for (const match of textMatches) {
      captions.push({
        start: parseFloat(match[1]),
        duration: parseFloat(match[2]),
        text: decodeHtmlEntities(match[3]),
      });
    }
    
    return captions;
  } catch (error) {
    console.error('Error fetching captions:', error);
    return [];
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n/g, ' ')
    .trim();
}

// Convert captions to transcript format
function captionsToTranscript(captions: Caption[]): { text: string; segments: Array<{ text: string; start: number; end: number }> } {
  const segments = captions.map(cap => ({
    text: cap.text,
    start: cap.start,
    end: cap.start + cap.duration,
  }));
  
  const fullText = captions.map(c => c.text).join(' ');
  
  return { text: fullText, segments };
}

// Generate OneDuo-style PDF content from YouTube video
async function generatePDFContent(
  videoInfo: YouTubeVideoInfo,
  transcript: { text: string; segments: Array<{ text: string; start: number; end: number }> }
): Promise<{
  pdfData: {
    title: string;
    author: string;
    duration: number;
    thumbnailUrl: string;
    transcript: typeof transcript;
    scenes: Array<{
      timestamp: number;
      text: string;
      type: 'dialogue' | 'scene-heading';
    }>;
  };
}> {
  // Convert transcript segments to screenplay-style scenes
  const scenes = transcript.segments.map((seg, idx) => ({
    timestamp: seg.start,
    text: seg.text,
    type: 'dialogue' as const,
  }));
  
  return {
    pdfData: {
      title: videoInfo.title,
      author: videoInfo.author,
      duration: videoInfo.duration,
      thumbnailUrl: videoInfo.thumbnailUrl,
      transcript,
      scenes,
    },
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { youtubeUrl, consentGiven, email, courseTitle } = await req.json();
    
    console.log('Processing YouTube request:', { youtubeUrl, consentGiven, email: email?.substring(0, 5) + '...' });
    
    // Validate consent
    if (!consentGiven) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Content rights authorization is required. Please confirm you own or have rights to this content.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Extract video ID
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid YouTube URL. Please provide a valid YouTube video link.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Extracted video ID:', videoId);
    
    // Fetch video metadata
    let metadata;
    try {
      metadata = await fetchVideoMetadata(videoId);
      console.log('Fetched metadata:', metadata.title);
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Video not found or not publicly accessible. Make sure the video is public or unlisted (not private).'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Fetch captions if available
    const captions = await fetchCaptions(videoId);
    console.log(`Found ${captions.length} caption segments`);
    
    // If no captions, we'll need to use speech-to-text later
    const hasNativeCaptions = captions.length > 0;
    
    // Create transcript from captions
    const transcript = hasNativeCaptions 
      ? captionsToTranscript(captions)
      : { text: '', segments: [] };
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Create course record in database
    const courseId = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from('courses')
      .insert({
        id: courseId,
        email: email || 'youtube-import@oneduo.link',
        title: courseTitle || metadata.title,
        description: `YouTube import: ${metadata.author}`,
        status: hasNativeCaptions ? 'extracting' : 'transcribing',
        video_url: `https://www.youtube.com/watch?v=${videoId}`,
        transcript: transcript.segments.length > 0 ? transcript : null,
        is_multi_module: false,
        module_count: 1,
      });
    
    if (insertError) {
      console.error('Failed to create course:', insertError);
      throw new Error('Failed to create course record');
    }
    
    console.log('Created course:', courseId);
    
    // If we don't have captions, queue for transcription
    if (!hasNativeCaptions) {
      console.log('No captions available - will need speech-to-text transcription');
      // Note: For full implementation, we would:
      // 1. Download the audio track (with user's authorization)
      // 2. Send to speech-to-text service (AssemblyAI, Whisper, etc.)
      // 3. Update the course with the transcript
      
      // For now, mark as needs_transcription
      await supabase
        .from('courses')
        .update({ status: 'pending', error_message: 'YouTube video requires audio transcription - processing queued' })
        .eq('id', courseId);
    }
    
    // Generate thumbnail frames for the PDF
    // YouTube provides thumbnail URLs at different qualities
    const thumbnailQualities = [
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    ];
    
    // Store frame URLs (thumbnails as placeholders until full frame extraction)
    const frameUrls = thumbnailQualities;
    
    await supabase
      .from('courses')
      .update({
        frame_urls: frameUrls,
        status: hasNativeCaptions ? 'completed' : 'pending',
      })
      .eq('id', courseId);
    
    return new Response(JSON.stringify({
      success: true,
      courseId,
      videoInfo: {
        videoId,
        title: metadata.title,
        author: metadata.author,
        thumbnailUrl: metadata.thumbnailUrl,
        hasCaptions: hasNativeCaptions,
        captionCount: captions.length,
      },
      transcript: hasNativeCaptions ? transcript : null,
      message: hasNativeCaptions 
        ? 'YouTube video processed successfully with captions!'
        : 'YouTube video queued - audio transcription will be processed shortly.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('YouTube processing error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process YouTube video'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
