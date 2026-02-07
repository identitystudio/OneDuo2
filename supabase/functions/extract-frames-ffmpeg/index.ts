import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ExtractionRequest {
  videoUrl: string;
  courseId: string;
  fps: number;
  tableName?: string; // 'courses' or 'course_modules'
  recordId?: string;  // If different from courseId (for modules)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { videoUrl, courseId, fps = 3, tableName = 'courses', recordId }: ExtractionRequest = await req.json();
    const targetId = recordId || courseId;

    console.log(`[extract-frames-ffmpeg] Starting extraction for ${targetId}, fps: ${fps}`);

    if (!videoUrl) {
      return new Response(JSON.stringify({ error: "Missing videoUrl" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URL is from allowed sources (SSRF protection)
    const isAllowed = isAllowedVideoUrl(videoUrl);
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Invalid video URL source" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get video duration first (needed for calculating expected frame count)
    const duration = await getVideoDuration(videoUrl);
    console.log(`[extract-frames-ffmpeg] Video duration: ${duration}s`);

    // Calculate expected frames
    const expectedFrames = Math.floor(duration * fps);
    console.log(`[extract-frames-ffmpeg] Expected frames: ${expectedFrames} at ${fps} fps`);

    // LONG VIDEO HARDENING:
    // For 2+ hour videos (7200s+), we use a more aggressive sampling strategy
    // to prevent timeouts and memory issues
    const isLongVideo = duration > 7200;
    const isVeryLongVideo = duration > 14400; // 4+ hours
    const isExtremelyLongVideo = duration > 25200; // 7+ hours
    
    // Use ffmpeg.wasm in streaming mode to extract frames
    // We'll use a frame extraction service approach - fetch frames at specific timestamps
    const frameUrls: string[] = [];
    
    // Frame limits based on video length:
    // - Short videos (< 2 hours): up to 10800 frames (1 hour at 3fps)
    // - Long videos (2-4 hours): up to 7200 frames (use 1fps equivalent)
    // - Very long videos (4+ hours): up to 5400 frames (more aggressive sampling)
    let maxFrames: number;
    if (isVeryLongVideo) {
      maxFrames = 5400;
      console.log(`[extract-frames-ffmpeg] Very long video (${Math.round(duration/3600)}h), limiting to ${maxFrames} frames`);
    } else if (isLongVideo) {
      maxFrames = 7200;
      console.log(`[extract-frames-ffmpeg] Long video (${Math.round(duration/3600)}h), limiting to ${maxFrames} frames`);
    } else {
      maxFrames = 10800;
    }
    
    const framesToExtract = Math.min(expectedFrames, maxFrames);
    
    // For very long videos, we sample instead of extracting all frames
    const sampleInterval = expectedFrames > framesToExtract 
      ? Math.ceil(expectedFrames / framesToExtract) 
      : 1;
    
    const actualFramesToExtract = Math.ceil(expectedFrames / sampleInterval);
    console.log(`[extract-frames-ffmpeg] Extracting ${actualFramesToExtract} frames (sample every ${sampleInterval}, isLongVideo: ${isLongVideo})`);

    // For long videos, use reduced FPS to help Replicate process faster
    const effectiveFps = isVeryLongVideo ? Math.min(fps, 1) : (isLongVideo ? Math.min(fps, 2) : fps);
    if (effectiveFps !== fps) {
      console.log(`[extract-frames-ffmpeg] Adjusted FPS from ${fps} to ${effectiveFps} for long video`);
    }

    // Update progress
    await supabase.from(tableName).update({
      progress: 30,
      total_frames: actualFramesToExtract,
    }).eq("id", targetId);

    // Extract frames using ffmpeg via a remote service
    // We'll use replicate but with a more optimized approach, or fall back to direct extraction
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    
    if (REPLICATE_API_KEY) {
      // Use Replicate with optimized settings based on video length
      const frames = await extractWithReplicate(
        videoUrl, 
        effectiveFps, 
        REPLICATE_API_KEY, 
        duration,
        isLongVideo,
        isVeryLongVideo
      );
      
      if (frames && frames.length > 0) {
        // Store frame URLs with metadata about sampling
        await supabase.from(tableName).update({
          frame_urls: frames,
          total_frames: frames.length,
          processed_frames: frames.length,
          progress: 50,
          video_duration_seconds: duration,
        }).eq("id", targetId);

        console.log(`[extract-frames-ffmpeg] Success: ${frames.length} frames extracted from ${Math.round(duration/60)}min video`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          frameCount: frames.length,
          duration,
          isLongVideo,
          effectiveFps,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Frame extraction failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[extract-frames-ffmpeg] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// SSRF Protection
function isAllowedVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const trimmed = url.trim().toLowerCase();
  
  // Block internal/private network URLs
  const blockedPatterns = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/10\./,
    /^https?:\/\/192\.168\./,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^https?:\/\/169\.254\./,
    /^https?:\/\/metadata\./,
    /^file:/,
    /^ftp:/,
  ];
  
  for (const pattern of blockedPatterns) {
    if (pattern.test(trimmed)) return false;
  }
  
  // Allow our Supabase storage
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (supabaseUrl && trimmed.includes(supabaseUrl.toLowerCase().replace('https://', '')) && trimmed.includes('/storage/')) {
    return true;
  }
  
  // Allow known video platforms
  return trimmed.includes('loom.com/share/') ||
         trimmed.includes('vimeo.com/') ||
         trimmed.includes('player.vimeo.com/') ||
         trimmed.includes('zoom.us/rec/') ||
         trimmed.includes('zoom.us/recording/');
}

// Get video duration using HEAD request or probe
async function getVideoDuration(videoUrl: string): Promise<number> {
  try {
    // Try to get duration from video metadata via HEAD request
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    
    // Estimate duration based on file size if content-length available
    // Average bitrate assumption: 2Mbps for video
    if (contentLength) {
      const bytes = parseInt(contentLength);
      const estimatedDuration = bytes / (2 * 1024 * 1024 / 8); // 2Mbps = 256KB/s
      if (estimatedDuration > 0 && estimatedDuration < 36000) { // Max 10 hours
        return Math.max(30, estimatedDuration); // Minimum 30 seconds
      }
    }
    
    // Default fallback
    return 300; // 5 minutes default
  } catch (error) {
    console.warn("[getVideoDuration] Failed to estimate duration:", error);
    return 300;
  }
}

// Extract frames using Replicate with optimized settings for long videos
async function extractWithReplicate(
  videoUrl: string, 
  fps: number, 
  apiKey: string,
  duration: number,
  isLongVideo: boolean = false,
  isVeryLongVideo: boolean = false
): Promise<string[]> {
  const Replicate = (await import("https://esm.sh/replicate@0.25.2")).default;
  const replicate = new Replicate({ auth: apiKey });

  // Get latest model version
  const modelResponse = await fetch("https://api.replicate.com/v1/models/fofr/video-to-frames", {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  
  if (!modelResponse.ok) throw new Error(`Failed to fetch model info: ${modelResponse.status}`);
  const modelData = await modelResponse.json();
  const latestVersionId = modelData.latest_version?.id;
  if (!latestVersionId) throw new Error("Could not find model version");

  // LONG VIDEO OPTIMIZATION:
  // Resolution settings - prioritize readability for AI consumption
  // Standard videos: 1080px for maximum text clarity
  // Long videos: 720px (still HD, text readable)
  // Very long videos: 540px (reduced but still legible)
  const resolution = isVeryLongVideo ? 540 : (isLongVideo ? 720 : 1080);
  
  console.log(`[extractWithReplicate] Starting extraction: fps=${fps}, resolution=${resolution}, duration=${Math.round(duration/60)}min`);

  // Create prediction with optimized settings
  let prediction = null;
  let retryAttempts = 0;
  const maxRetries = isLongVideo ? 15 : 10; // More retries for long videos
  
  while (!prediction && retryAttempts < maxRetries) {
    try {
      prediction = await replicate.predictions.create({
        version: latestVersionId,
        input: { 
          video: videoUrl, 
          fps: fps,
          width: resolution,
        },
      });
    } catch (error: any) {
      if (error?.response?.status === 429) {
        // Longer delays for long videos to avoid hammering the API
        const baseDelay = isLongVideo ? 15000 : 10000;
        const delay = baseDelay * Math.pow(1.5, retryAttempts);
        console.log(`[extractWithReplicate] Rate limited, waiting ${delay}ms (attempt ${retryAttempts + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        retryAttempts++;
      } else {
        throw error;
      }
    }
  }

  if (!prediction) throw new Error("Failed to start frame extraction after max retries");

  // Poll for completion with generous timeout for long videos (2+ hours)
  let result = prediction;
  
  // LONG VIDEO TIMEOUT SCALING:
  // - Short videos (< 2h): 30 minutes max
  // - Long videos (2-4h): 60 minutes max  
  // - Very long videos (4-7h): 120 minutes max
  // - Extremely long videos (7h+): 180 minutes max
  let maxWaitTime: number;
  const durationHours = duration / 3600;
  if (durationHours >= 7) {
    maxWaitTime = 10800000; // 180 minutes for 7+ hour videos
  } else if (isVeryLongVideo) {
    maxWaitTime = 7200000; // 120 minutes for 4-7 hour videos
  } else if (isLongVideo) {
    maxWaitTime = 3600000; // 60 minutes
  } else {
    maxWaitTime = Math.max(duration * 3000, 1800000); // At least 30 min, or 3x duration
  }
  
  const startTime = Date.now();
  let lastLogTime = startTime;
  
  while (result.status !== "succeeded" && result.status !== "failed") {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitTime) {
      console.warn(`[extractWithReplicate] Timeout after ${Math.round(elapsed/60000)} minutes for ${Math.round(duration/60)}min video`);
      throw new Error(`Frame extraction timeout after ${Math.round(elapsed/60000)} minutes`);
    }
    
    // Poll every 5 seconds for short videos, 10 seconds for long videos
    await new Promise((r) => setTimeout(r, isLongVideo ? 10000 : 5000));
    result = await replicate.predictions.get(prediction.id);
    
    // Log progress every minute
    if (Date.now() - lastLogTime > 60000) {
      console.log(`[extractWithReplicate] Status: ${result.status}, elapsed: ${Math.round(elapsed/60000)}min/${Math.round(maxWaitTime/60000)}min`);
      lastLogTime = Date.now();
    }
  }

  if (result.status === "failed") {
    throw new Error(result.error || "Frame extraction failed");
  }

  return result.output || [];
}
