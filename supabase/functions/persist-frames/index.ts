/**
 * Persist Frames Edge Function
 * 
 * Extracts frames from the stored video (video_url) and persists them to storage.
 * This ensures frames are always available from controlled storage, never relying
 * on expired external CDN URLs.
 * 
 * If video_url frames cannot be extracted, falls back to re-extracting via Replicate.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Include common headers the web client may send (prevents CORS preflight failures)
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PersistRequest {
  courseId: string;
  moduleId?: string;
  maxFrames?: number;
  forceReExtract?: boolean; // Force re-extraction from video
}

interface PersistResult {
  success: boolean;
  persistedUrls: string[];
  failedCount: number;
  totalCount: number;
  source: 'storage_cache' | 'video_extract' | 'replicate_fresh' | 'existing_frames';
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { courseId, moduleId, maxFrames = 100, forceReExtract = false }: PersistRequest = await req.json();

    if (!courseId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Missing courseId" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[persist-frames] Starting for course ${courseId}, moduleId: ${moduleId || 'none'}, maxFrames: ${maxFrames}`);

    // Step 1: Check if we already have persisted frames in storage
    const storagePath = `frames/${courseId}`;
    if (!forceReExtract) {
      const existingFrames = await checkExistingFrames(supabase, storagePath, maxFrames);
      if (existingFrames.length >= maxFrames) { // 100% required
        console.log(`[persist-frames] Using ${existingFrames.length} cached frames from storage`);
        return new Response(JSON.stringify({
          success: true,
          persistedUrls: existingFrames.slice(0, maxFrames),
          failedCount: 0,
          totalCount: existingFrames.length,
          source: 'storage_cache',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step 2: Get course/module data to find video_url + existing frame_urls
    let videoUrl: string | null = null;
    let videoDuration: number | null = null;
    let existingFrameUrls: string[] = [];

    if (moduleId) {
      const { data: module } = await supabase
        .from('course_modules')
        .select('video_url, video_duration_seconds, stitched_video_url, frame_urls')
        .eq('id', moduleId)
        .single();
      
      videoUrl = module?.stitched_video_url || module?.video_url;
      videoDuration = module?.video_duration_seconds;
      existingFrameUrls = (module?.frame_urls as string[]) || [];
    } else {
      const { data: course } = await supabase
        .from('courses')
        .select('video_url, video_duration_seconds, frame_urls')
        .eq('id', courseId)
        .single();
      
      videoUrl = course?.video_url;
      videoDuration = course?.video_duration_seconds;
      existingFrameUrls = (course?.frame_urls as string[]) || [];
    }

    if (!videoUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "No video_url found for course/module" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[persist-frames] Video URL found, duration: ${videoDuration}s`);

    // Step 3: Prefer persisting from existing frame_urls first (fast path)
    // This avoids long Replicate polling and is usually enough when frame URLs are still valid.
    let extractedFrames: string[] = [];
    let source: PersistResult['source'] = 'existing_frames';

    if (!forceReExtract && Array.isArray(existingFrameUrls) && existingFrameUrls.length > 0) {
      // Use extra candidates to tolerate expired/broken frame URLs while still
      // producing enough persisted frames for the PDF integrity gate.
      const candidateCount = Math.min(
        existingFrameUrls.length,
        Math.min(300, Math.ceil(maxFrames * 2))
      );

      extractedFrames = sampleFramesEvenly(existingFrameUrls, candidateCount);
      console.log(`[persist-frames] Using ${candidateCount} sampled existing frame_urls as primary source`);
    } else {
      // Slow path: extract fresh frames from video via Replicate
      source = 'replicate_fresh';

      const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
      if (!REPLICATE_API_KEY) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "REPLICATE_API_KEY not configured" 
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[persist-frames] Extracting ${maxFrames} frames from video via Replicate...`);

      try {
        extractedFrames = await extractFramesFromVideo(
          videoUrl,
          maxFrames,
          videoDuration || 300,
          REPLICATE_API_KEY
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[persist-frames] Video extraction failed: ${msg}`);
        console.warn('[persist-frames] Falling back to existing frame_urls on entity...');

        if (!existingFrameUrls || existingFrameUrls.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Frame extraction failed and no existing frame_urls were found for fallback'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const candidateCount = Math.min(
          existingFrameUrls.length,
          Math.min(300, Math.ceil(maxFrames * 2))
        );

        extractedFrames = sampleFramesEvenly(existingFrameUrls, candidateCount);
        source = 'existing_frames';
        console.log(`[persist-frames] Using ${candidateCount} sampled existing frame_urls as fallback source`);
      }
    }

    if (!extractedFrames || extractedFrames.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Frame extraction from video failed - no frames returned" 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[persist-frames] Extracted ${extractedFrames.length} frames, now persisting to storage...`);

    // Step 4: Persist extracted frames to our storage
    const persistedUrls: string[] = [];
    let failedCount = 0;

    // OPTIMIZED: Increased batch size to 25 for faster parallel uploads
    // Edge functions can handle high concurrency efficiently
    const BATCH_SIZE = 25;

    outer: for (let i = 0; i < extractedFrames.length; i += BATCH_SIZE) {
      const batch = extractedFrames.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((url, batchIdx) => 
          persistFrameToStorage(supabase, supabaseUrl, courseId, url, i + batchIdx)
        )
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          persistedUrls.push(result.value);
        } else {
          failedCount++;
        }
      }

      // Stop early once we have the required number of persisted frames.
      if (persistedUrls.length >= maxFrames) {
        console.log(`[persist-frames] Reached required persisted frames: ${persistedUrls.length}/${maxFrames}`);
        break outer;
      }

      // Progress log every 50 frames
      if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= extractedFrames.length) {
        console.log(`[persist-frames] Progress: ${Math.min(i + BATCH_SIZE, extractedFrames.length)}/${extractedFrames.length} (${persistedUrls.length} persisted)`);
      }
    }

    const result: PersistResult = {
      // Success means we persisted *some* usable frames.
      // The client-side PDF exporter enforces the integrity gate (e.g. >=50% required).
      success: persistedUrls.length > 0,
      persistedUrls: persistedUrls.slice(0, maxFrames),
      failedCount,
      totalCount: extractedFrames.length,
      source,
    };

    console.log(`[persist-frames] Complete: ${persistedUrls.length}/${extractedFrames.length} persisted, ${failedCount} failed`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[persist-frames] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Check if we already have frames in storage for this course
 */
async function checkExistingFrames(
  supabase: any,
  storagePath: string,
  maxFrames: number
): Promise<string[]> {
  try {
    const { data: files, error } = await supabase.storage
      .from('course-videos')
      .list(storagePath, { limit: maxFrames + 10, sortBy: { column: 'name', order: 'asc' } });

    if (error || !files || files.length === 0) {
      return [];
    }

    // Filter to only image files and build public URLs
    const imageFiles = files.filter((f: any) => 
      f.name.endsWith('.png') || f.name.endsWith('.jpg') || f.name.endsWith('.jpeg')
    );

    return imageFiles.map((f: any) => {
      const { data } = supabase.storage
        .from('course-videos')
        .getPublicUrl(`${storagePath}/${f.name}`);
      return data?.publicUrl;
    }).filter(Boolean);
  } catch (err) {
    console.warn('[checkExistingFrames] Error:', err);
    return [];
  }
}

/**
 * Extract frames from video using Replicate
 */
async function extractFramesFromVideo(
  videoUrl: string,
  maxFrames: number,
  duration: number,
  apiKey: string
): Promise<string[]> {
  const Replicate = (await import("https://esm.sh/replicate@0.25.2")).default;
  const replicate = new Replicate({ auth: apiKey });

  // Replicate model requires integer fps >= 1.
  // We choose the smallest allowed fps that still yields enough candidate frames,
  // then sample evenly down to maxFrames.
  const targetFps = Math.max(1, Math.min(3, Math.ceil(maxFrames / Math.max(1, duration))));
  console.log(`[extractFramesFromVideo] Using FPS: ${targetFps} (int) for target ${maxFrames} frames over ${Math.round(duration)}s`);

  // Get latest model version
  const modelResponse = await fetch("https://api.replicate.com/v1/models/fofr/video-to-frames", {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  
  if (!modelResponse.ok) {
    throw new Error(`Failed to fetch model info: ${modelResponse.status}`);
  }
  
  const modelData = await modelResponse.json();
  const latestVersionId = modelData.latest_version?.id;
  if (!latestVersionId) {
    throw new Error("Could not find model version");
  }

  // Create prediction with retry logic
  let prediction = null;
  let retryAttempts = 0;
  const maxRetries = 5;
  
  while (!prediction && retryAttempts < maxRetries) {
    try {
      prediction = await replicate.predictions.create({
        version: latestVersionId,
        input: {
          video: videoUrl,
          fps: targetFps,
          width: 640,
        },
      });
    } catch (error: any) {
      if (error?.response?.status === 429) {
        const delay = 10000 * Math.pow(1.5, retryAttempts);
        console.log(`[extractFramesFromVideo] Rate limited, waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        retryAttempts++;
      } else {
        throw error;
      }
    }
  }

  if (!prediction) {
    throw new Error("Failed to start frame extraction after max retries");
  }

  // Poll for completion (generous timeout)
  let result = prediction;
  const maxWaitTime = Math.max(duration * 2000, 600000); // At least 10 min, or 2x duration
  const startTime = Date.now();
  
  while (result.status !== "succeeded" && result.status !== "failed") {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitTime) {
      throw new Error(`Frame extraction timeout after ${Math.round(elapsed/60000)} minutes`);
    }
    
    await new Promise((r) => setTimeout(r, 5000));
    result = await replicate.predictions.get(prediction.id);
    
    if (elapsed % 30000 < 5000) {
      console.log(`[extractFramesFromVideo] Status: ${result.status}, elapsed: ${Math.round(elapsed/1000)}s`);
    }
  }

  if (result.status === "failed") {
    throw new Error(result.error || "Frame extraction failed");
  }

  const frames = result.output || [];
  
  // Sample evenly if we got more than maxFrames
  if (frames.length > maxFrames) {
    const step = frames.length / maxFrames;
    const sampled: string[] = [];
    for (let i = 0; i < maxFrames; i++) {
      sampled.push(frames[Math.floor(i * step)]);
    }
    return sampled;
  }
  
  return frames;
}

/**
 * Evenly sample N items from an array (preserves order).
 */
function sampleFramesEvenly(frames: string[], count: number): string[] {
  if (!Array.isArray(frames) || frames.length === 0) return [];
  if (count <= 0) return [];
  if (frames.length <= count) return frames.slice();

  const step = frames.length / count;
  const sampled: string[] = [];
  for (let i = 0; i < count; i++) {
    sampled.push(frames[Math.floor(i * step)]);
  }
  return sampled;
}

/**
 * Download a frame from CDN and upload to our storage
 */
async function persistFrameToStorage(
  supabase: any,
  supabaseUrl: string,
  courseId: string,
  cdnUrl: string,
  frameIndex: number
): Promise<string | null> {
  try {
    // Fetch the image
    const response = await fetch(cdnUrl, {
      headers: { 'Accept': 'image/*' },
    });

    if (!response.ok) {
      console.warn(`[persistFrameToStorage] Fetch failed for frame ${frameIndex}: ${response.status}`);
      return null;
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    
    // Upload to our storage bucket
    const storagePath = `frames/${courseId}/frame-${String(frameIndex).padStart(5, '0')}.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from('course-videos')
      .upload(storagePath, imageBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.warn(`[persistFrameToStorage] Upload failed for frame ${frameIndex}:`, uploadError.message);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('course-videos')
      .getPublicUrl(storagePath);

    return publicUrlData?.publicUrl || null;

  } catch (error) {
    console.error(`[persistFrameToStorage] Error processing frame ${frameIndex}:`, error);
    return null;
  }
}
