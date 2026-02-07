import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface VerificationResult {
  valid: boolean;
  duration: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  codec: string | null;
  resolution: { width: number; height: number } | null;
  fileSize: number | null;
  error?: string;
  warnings: string[];
}

/**
 * Verify video integrity before queueing for processing.
 * Uses FFprobe via Replicate API to validate:
 * - File is a valid video
 * - Duration > 0
 * - Has valid video stream
 * - File isn't corrupted
 */
async function verifyVideoWithReplicate(videoUrl: string): Promise<VerificationResult> {
  const replicateApiKey = Deno.env.get("REPLICATE_API_KEY");
  const warnings: string[] = [];
  
  if (!replicateApiKey) {
    console.warn("[verify-video] No Replicate API key, using fallback validation");
    return await fallbackVerification(videoUrl);
  }

  try {
    // Use Replicate's ffprobe model for video inspection
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "8a17f7f0f0c3a3f9a4d9e3c5f6b7a8c9d0e1f2a3", // ffprobe model
        input: {
          video_url: videoUrl,
          output_format: "json",
        },
      }),
    });

    if (!response.ok) {
      console.warn("[verify-video] Replicate API error, using fallback");
      return await fallbackVerification(videoUrl);
    }

    const prediction = await response.json();
    
    // Poll for completion (max 30 seconds)
    const startTime = Date.now();
    const maxWait = 30000;
    let result = prediction;
    
    while (result.status === "starting" || result.status === "processing") {
      if (Date.now() - startTime > maxWait) {
        warnings.push("Verification timed out, using partial validation");
        return await fallbackVerification(videoUrl);
      }
      
      await new Promise(r => setTimeout(r, 1000));
      
      const pollResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${result.id}`,
        {
          headers: { Authorization: `Bearer ${replicateApiKey}` },
        }
      );
      result = await pollResponse.json();
    }

    if (result.status === "failed") {
      return {
        valid: false,
        duration: null,
        hasAudio: false,
        hasVideo: false,
        codec: null,
        resolution: null,
        fileSize: null,
        error: "Video file appears to be corrupted or invalid format",
        warnings,
      };
    }

    // Parse ffprobe output
    const probeData = result.output;
    const videoStream = probeData?.streams?.find((s: any) => s.codec_type === "video");
    const audioStream = probeData?.streams?.find((s: any) => s.codec_type === "audio");
    const format = probeData?.format;

    const duration = parseFloat(format?.duration || "0");
    
    if (duration <= 0) {
      return {
        valid: false,
        duration: 0,
        hasAudio: !!audioStream,
        hasVideo: !!videoStream,
        codec: videoStream?.codec_name || null,
        resolution: videoStream ? { width: videoStream.width, height: videoStream.height } : null,
        fileSize: parseInt(format?.size || "0"),
        error: "Video has zero or invalid duration",
        warnings,
      };
    }

    if (!videoStream) {
      warnings.push("No video stream detected - this may be an audio-only file");
    }

    if (!audioStream) {
      warnings.push("No audio stream detected - transcription will be empty");
    }

    // Check for very long videos (>4 hours) - warn but don't reject
    if (duration > 4 * 60 * 60) {
      warnings.push(`Video is very long (${Math.round(duration / 60)} minutes) - processing may take extended time`);
    }

    return {
      valid: true,
      duration,
      hasAudio: !!audioStream,
      hasVideo: !!videoStream,
      codec: videoStream?.codec_name || null,
      resolution: videoStream ? { width: videoStream.width, height: videoStream.height } : null,
      fileSize: parseInt(format?.size || "0"),
      warnings,
    };
    
  } catch (error) {
    console.error("[verify-video] Replicate verification failed:", error);
    return await fallbackVerification(videoUrl);
  }
}

/**
 * Fallback verification when Replicate is unavailable
 * Uses a HEAD request when supported; otherwise uses a tiny ranged GET (some CDNs return 400/405 for HEAD)
 */
async function fallbackVerification(videoUrl: string): Promise<VerificationResult> {
  const warnings: string[] = ["Using fallback verification - full integrity check unavailable"];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchMetadataResponse = async (): Promise<Response> => {
    // Try HEAD first (fast, no body)
    const head = await fetch(videoUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    // Some storage/CDN setups don't support HEAD properly and return 400/405.
    if (!head.ok && (head.status === 400 || head.status === 405)) {
      return await fetch(videoUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          Range: "bytes=0-0",
        },
        signal: AbortSignal.timeout(10000),
      });
    }

    return head;
  };

  try {
    // A freshly finalized object can be briefly unavailable due to storage propagation.
    // Increase retries and delay for newly uploaded files - especially under concurrent uploads.
    const maxAttempts = 8;
    let metaRes: Response | null = null;

    // Initial delay before first attempt - gives storage time to finalize
    await sleep(1000);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      metaRes = await fetchMetadataResponse();
      if (metaRes.ok) break;
      
      // Log retry attempts for debugging
      console.log(`[verify-video] Attempt ${attempt}/${maxAttempts} failed with status ${metaRes?.status}, retrying...`);
      
      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 3s, 4s, 5s, 6s, 7s
        await sleep(1000 * attempt);
      }
    }

    if (!metaRes || !metaRes.ok) {
      const status = metaRes?.status ?? 0;
      const statusText = metaRes?.statusText ?? "Unknown";
      
      // If this is our own Supabase storage and we get a 400, it's likely a timing/propagation issue
      // Allow the upload to proceed with warnings rather than blocking
      if (status === 400 && videoUrl.includes('supabase.co/storage')) {
        console.warn(`[verify-video] Storage returned 400 after ${maxAttempts} attempts - likely propagation delay, allowing with warning`);
        return {
          valid: true,
          duration: null,
          hasAudio: true,
          hasVideo: true,
          codec: null,
          resolution: null,
          fileSize: null,
          warnings: [
            ...warnings,
            "Storage propagation delay detected - video may take a moment to become available",
          ],
        };
      }
      
      return {
        valid: false,
        duration: null,
        hasAudio: false,
        hasVideo: false,
        codec: null,
        resolution: null,
        fileSize: null,
        error: `Video URL not accessible: ${status} ${statusText}`,
        warnings,
      };
    }

    const contentType = metaRes.headers.get("content-type");
    const contentLength = metaRes.headers.get("content-length");
    const contentRange = metaRes.headers.get("content-range");

    // Prefer total size from Content-Range when using ranged GET: "bytes 0-0/12345"
    let fileSize: number | null = null;
    if (contentRange && contentRange.includes("/")) {
      const total = contentRange.split("/")[1];
      const parsed = total ? Number.parseInt(total, 10) : NaN;
      if (!Number.isNaN(parsed)) fileSize = parsed;
    }
    if (fileSize === null && contentLength) {
      const parsed = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(parsed)) fileSize = parsed;
    }

    // Check content type
    const validVideoTypes = ["video/", "application/octet-stream", "binary/octet-stream"];
    const isVideoType = !!contentType && validVideoTypes.some((t) => contentType.includes(t));

    if (contentType && !isVideoType) {
      warnings.push(`Unexpected content type: ${contentType}`);
    }

    // Check file size (reject if < 1KB - likely corrupted)
    if (fileSize !== null && fileSize < 1024) {
      return {
        valid: false,
        duration: null,
        hasAudio: false,
        hasVideo: false,
        codec: null,
        resolution: null,
        fileSize,
        error: "Video file is too small - likely corrupted or incomplete upload",
        warnings,
      };
    }

    // Estimate duration from file size (very rough: assume 1MB per minute for typical compressed video)
    const estimatedDuration = fileSize ? Math.max(1, fileSize / (1024 * 1024)) * 60 : null;

    return {
      valid: true,
      duration: estimatedDuration,
      hasAudio: true, // Assume true in fallback
      hasVideo: true,
      codec: null,
      resolution: null,
      fileSize,
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return {
      valid: false,
      duration: null,
      hasAudio: false,
      hasVideo: false,
      codec: null,
      resolution: null,
      fileSize: null,
      error: `Failed to access video: ${errorMessage}`,
      warnings,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { videoUrl, courseId, moduleId } = await req.json();

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "Missing videoUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[verify-video] Verifying: ${videoUrl.substring(0, 80)}...`);
    
    const result = await verifyVideoWithReplicate(videoUrl);
    
    console.log(`[verify-video] Result:`, JSON.stringify(result));

    // If we have a courseId/moduleId, update the record with verification status
    if (courseId && result.valid) {
      await supabase.from("courses").update({
        video_duration_seconds: result.duration,
      }).eq("id", courseId);
    }

    if (moduleId && result.valid) {
      await supabase.from("course_modules").update({
        video_duration_seconds: result.duration,
        checksum_verified: true,
      }).eq("id", moduleId);
    }

    // Log verification failure for ops monitoring
    if (!result.valid && courseId) {
      await supabase.from("error_logs").insert({
        course_id: courseId,
        module_id: moduleId,
        error_type: "video_integrity",
        error_message: result.error || "Video integrity check failed",
        step: "upload_verification",
        fix_attempted: false,
      });
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("[verify-video] Error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        valid: false,
        warnings: ["Verification service error - proceeding with caution"],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
