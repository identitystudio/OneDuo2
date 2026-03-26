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
    const { videoUrl, courseId, fps: requestedFps, tableName = 'courses', recordId }: ExtractionRequest = await req.json();
    const targetId = recordId || courseId;

    console.log(`[extract-frames-ffmpeg] Starting extraction for ${targetId}, requested fps: ${requestedFps}`);

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

    // Generate a signed URL FIRST so both duration estimation and Replicate can access private storage.
    // Public-path URLs (/object/public/) return 400 for private buckets when accessed externally.
    // Mirrors resolveVideoUrlForExternalServices in process-course: retry + HEAD verify.
    let accessibleVideoUrl = videoUrl;
    if (videoUrl.includes('/storage/v1/object/')) {
      // Parse bucket + path using URL API for robustness
      let bucket: string;
      let path: string;
      try {
        const u = new URL(videoUrl);
        const parts = u.pathname.split('/').filter(Boolean);
        const objectIdx = parts.indexOf('object');
        bucket = parts[objectIdx + 2];
        path = parts.slice(objectIdx + 3).join('/');
      } catch {
        const storagePart = videoUrl.split('/storage/v1/object/')[1]
          .replace(/^(public|sign|authenticated)\//, '');
        bucket = storagePart.split('/')[0];
        path = storagePart.split('/').slice(1).join('/');
      }

      console.log(`[extract-frames-ffmpeg] Resolving signed URL: bucket=${bucket}, path=${path}`);

      let signedUrl: string | null = null;
      let lastErr = 'unknown';
      const maxAttempts = 15;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 86400);

        if (signedError || !signedData?.signedUrl) {
          lastErr = signedError?.message || 'no URL returned';
          console.warn(`[extract-frames-ffmpeg] Signed URL attempt ${attempt}/${maxAttempts} failed: ${lastErr}`);
          await new Promise(r => setTimeout(r, Math.min(1000 * attempt, 5000)));
          continue;
        }

        // Verify the signed URL is actually reachable (HEAD request)
        try {
          const head = await fetch(signedData.signedUrl, { method: 'HEAD' });
          if (head.ok) {
            signedUrl = signedData.signedUrl;
            console.log(`[extract-frames-ffmpeg] Signed URL verified on attempt ${attempt} (status ${head.status})`);
            break;
          }
          lastErr = `HEAD returned ${head.status}`;
          console.warn(`[extract-frames-ffmpeg] Signed URL attempt ${attempt}/${maxAttempts}: ${lastErr}`);
        } catch (headErr) {
          lastErr = `HEAD error: ${headErr instanceof Error ? headErr.message : headErr}`;
          console.warn(`[extract-frames-ffmpeg] Signed URL attempt ${attempt}/${maxAttempts}: ${lastErr}`);
        }

        await new Promise(r => setTimeout(r, Math.min(2000 + 1000 * attempt, 5000)));
      }

      if (signedUrl) {
        accessibleVideoUrl = signedUrl;
      } else {
        return new Response(JSON.stringify({
          error: `Could not get an accessible signed URL for the video after ${maxAttempts} attempts. Last error: ${lastErr}`,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Use actual duration from DB (accurate) — fall back to file-size estimation only if missing
    let duration = 0;
    const { data: dbRecord } = await supabase.from(tableName).select('video_duration_seconds').eq('id', targetId).single();
    if (dbRecord?.video_duration_seconds && dbRecord.video_duration_seconds > 0) {
      duration = dbRecord.video_duration_seconds;
      console.log(`[extract-frames-ffmpeg] Duration from DB: ${duration}s`);
    } else {
      // Use signed URL so HEAD request can access private storage and get content-length
      duration = await getVideoDuration(accessibleVideoUrl);
      console.warn(`[extract-frames-ffmpeg] DB duration missing — estimated from file size: ${duration}s`);
      if (duration <= 360) {
        console.warn(`[extract-frames-ffmpeg] WARNING: Duration estimate of ${duration}s seems too low for a course video — content-length may be missing from server headers`);
      }
    }
    const durationMin = Math.round(duration / 60);

    // 1 FPS = 1 frame per second = exact frame count matching video duration
    const fps = 1;
    const expectedFrames = Math.floor(duration * fps);
    const actualFramesToExtract = expectedFrames;

    console.log(`[extract-frames-ffmpeg] ========================================`);
    console.log(`[extract-frames-ffmpeg] Course/Module : ${targetId}`);
    console.log(`[extract-frames-ffmpeg] Video duration: ${duration}s (${durationMin} min)`);
    console.log(`[extract-frames-ffmpeg] FPS           : ${fps} (1 frame per second)`);
    console.log(`[extract-frames-ffmpeg] Expected frames: ${actualFramesToExtract}`);
    console.log(`[extract-frames-ffmpeg] ========================================`);

    const isLongVideo = duration > 7200;
    const isVeryLongVideo = duration > 14400;
    const effectiveFps = fps;

    await supabase.from(tableName).update({
      progress: 30,
      total_frames: actualFramesToExtract,
    }).eq("id", targetId);

    // Extract frames using ffmpeg via a remote service
    // We'll use replicate but with a more optimized approach, or fall back to direct extraction
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");

    if (REPLICATE_API_KEY) {
      // Fire-and-forget: create the Replicate prediction with a webhook URL so
      // replicate-webhook handles the result asynchronously. Do NOT poll here —
      // polling causes CPU timeout for videos longer than ~1 minute.
      const webhookUrl = `${supabaseUrl}/functions/v1/replicate-webhook`;
      const predictionId = await queueReplicatePrediction(
        accessibleVideoUrl,
        effectiveFps,
        REPLICATE_API_KEY,
        isLongVideo,
        isVeryLongVideo,
        webhookUrl,
        { courseId, recordId: targetId, tableName, step: 'extract_frames' },
        actualFramesToExtract
      );

      if (predictionId) {
        console.log(`[extract-frames-ffmpeg] ✅ Prediction queued: ${predictionId}`);
        console.log(`[extract-frames-ffmpeg] ⏳ Replicate will extract ~${actualFramesToExtract} frames from ${durationMin}min video`);
        console.log(`[extract-frames-ffmpeg] 📡 Webhook will fire at: ${supabaseUrl}/functions/v1/replicate-webhook`);
        return new Response(JSON.stringify({
          success: true,
          queued: true,
          predictionId,
          duration,
          estimatedFrames: actualFramesToExtract,
          message: `Queued extraction of ~${actualFramesToExtract} frames from ${durationMin}min video. Replicate will call back when done.`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Frame extraction failed — could not create Replicate prediction" }), {
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
    // Average bitrate assumption: 4Mbps for typical screen-recorded course video
    if (contentLength) {
      const bytes = parseInt(contentLength);
      const estimatedDuration = bytes / (4 * 1024 * 1024 / 8); // 4Mbps = 512KB/s
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

// Create a Replicate prediction and return immediately (fire-and-forget).
// replicate-webhook will handle the result via callback when Replicate finishes.
async function queueReplicatePrediction(
  videoUrl: string,
  fps: number,
  apiKey: string,
  isLongVideo: boolean = false,
  isVeryLongVideo: boolean = false,
  webhookUrl: string,
  webhookMetadata: Record<string, string>,
  maxFrames: number
): Promise<string | null> {
  const Replicate = (await import("https://esm.sh/replicate@0.25.2")).default;
  const replicate = new Replicate({ auth: apiKey });

  const modelResponse = await fetch("https://api.replicate.com/v1/models/fofr/video-to-frames", {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!modelResponse.ok) throw new Error(`Failed to fetch model info: ${modelResponse.status}`);
  const modelData = await modelResponse.json();
  const latestVersionId = modelData.latest_version?.id;
  if (!latestVersionId) throw new Error("Could not find model version");

  const resolution = isVeryLongVideo ? 540 : (isLongVideo ? 720 : 1080);
  console.log(`[queueReplicatePrediction] Creating prediction: fps=${fps}, resolution=${resolution}`);

  let retryAttempts = 0;
  const maxRetries = 5;

  while (retryAttempts < maxRetries) {
    try {
      const prediction = await replicate.predictions.create({
        version: latestVersionId,
        input: {
          video: videoUrl,
          fps: duration > 0 ? Math.min(fps, 295 / duration) : fps,
          webhook_metadata: webhookMetadata,
        },
        webhook: webhookUrl,
        webhook_events_filter: ["completed"], // Only notify on completion
      });
      return prediction.id;
    } catch (error: any) {
      if (error?.response?.status === 429) {
        const delay = 10000 * Math.pow(1.5, retryAttempts);
        console.log(`[queueReplicatePrediction] Rate limited, waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        retryAttempts++;
      } else {
        throw error;
      }
    }
  }

  return null;
}
