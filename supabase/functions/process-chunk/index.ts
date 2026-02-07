/**
 * Process Chunk Edge Function
 * 
 * Processes video chunks for manifest-based uploads.
 * 
 * For manifest-based uploads (large files split into storage chunks):
 * - Each storage chunk is processed separately through Replicate
 * - Frames are extracted from each ~500MB storage chunk individually
 * - Results are merged in order after all chunks complete
 * 
 * This avoids the timeout issues with streaming large files to Replicate.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Processing constants
const EXTRACTION_FPS = 1; // 1 frame per second (matches course default)
const TARGET_WIDTH = 640;

interface ProcessChunkRequest {
  courseId?: string;
  useStreamingProxy?: boolean; // Default true - use streaming proxy for full video
}

// Logging helper
async function logEvent(
  supabase: SupabaseClient,
  jobId: string,
  step: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('job_logs').insert({
      job_id: jobId,
      step,
      level,
      message,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
    console.log(`[ProcessChunk][${level}] ${step}: ${message}`);
  } catch (e) {
    console.warn('[ProcessChunk] Failed to log event:', e);
  }
}

interface ManifestChunk {
  path: string;
  size: number;
  order: number;
}

interface Manifest {
  type: string;
  version: number;
  totalSize: number;
  chunkCount: number;
  chunks: ManifestChunk[];
}

/**
 * Get manifest for a chunked upload
 */
async function getManifest(supabase: SupabaseClient, videoUrl: string): Promise<Manifest | null> {
  try {
    // Extract storage path from video URL
    const match = videoUrl.match(/video-uploads\/(.+?)(?:\?|$)/);
    if (!match) return null;

    let basePath = match[1];
    // Remove _chunk_XXXX suffix if present
    const chunkMatch = basePath.match(/^(.+?)_chunk_\d+$/);
    if (chunkMatch) {
      basePath = chunkMatch[1];
    }

    const manifestPath = `${basePath}.manifest.json`;

    const { data, error } = await supabase.storage
      .from('video-uploads')
      .download(manifestPath);

    if (error || !data) {
      console.log(`[ProcessChunk] No manifest found at ${manifestPath}. Checking file size...`);

      // Fallback: Check size of the single object
      const parts = basePath.split('/');
      const fileName = parts.pop();
      const folder = parts.join('/');

      const { data: objects, error: listError } = await supabase.storage
        .from('video-uploads')
        .list(folder, { search: fileName });

      if (listError || !objects || objects.length === 0) {
        console.warn(`[ProcessChunk] Could not get metadata for ${basePath}`);
        return null;
      }

      const totalSizeBytes = objects[0].metadata?.size || 0;

      // Return a "pseudo-manifest" for the single file
      return {
        type: 'single-file',
        version: 1,
        totalSize: totalSizeBytes,
        chunkCount: 1,
        chunks: [{
          path: match[1], // Use original path
          size: totalSizeBytes,
          order: 0
        }]
      };
    }

    const manifest = JSON.parse(await data.text()) as Manifest;
    console.log(`[ProcessChunk] Found manifest with ${manifest.chunkCount} storage chunks`);
    return manifest;
  } catch (e) {
    console.warn('[ProcessChunk] Error reading manifest:', e);
    return null;
  }
}

/**
 * Extract frames using the streaming proxy for chunked uploads
 * This reassembles all chunks on-the-fly and sends to Replicate as a single video
 */
async function extractFramesViaStreamingProxy(
  supabase: SupabaseClient,
  courseId: string,
  manifest: Manifest, // Pass the manifest object instead of path
  jobId: string
): Promise<string[]> {
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  if (!REPLICATE_API_KEY) {
    throw new Error('REPLICATE_API_KEY not configured');
  }

  // Determine the video URL for Replicate
  let videoUrl: string;
  if (manifest.type === 'single-file' && manifest.chunks.length > 0) {
    // For single large files, bypass the streaming proxy and get a direct signed URL
    console.log(`[ProcessChunk] Single file detected, getting direct signed URL for Replicate`);
    const { data: signedData } = await supabase.storage
      .from('video-uploads')
      .createSignedUrl(manifest.chunks[0].path, 7200); // 2 hours

    if (!signedData?.signedUrl) throw new Error("Failed to get signed URL for single file");
    videoUrl = signedData.signedUrl;
  } else {
    // For chunked uploads, use the streaming proxy to reassemble
    const manifestPath = `${manifest.chunks[0].path.split('_chunk_')[0]}.manifest.json`;
    videoUrl = `${supabaseUrl}/functions/v1/stream-chunked-video?manifest=${encodeURIComponent(manifestPath)}&courseId=${courseId}`;
    console.log(`[ProcessChunk] Using streaming proxy for extraction: ${videoUrl.slice(0, 100)}...`);
  }

  // Import Replicate
  const Replicate = (await import("https://esm.sh/replicate@0.25.2")).default;
  const replicate = new Replicate({ auth: REPLICATE_API_KEY });

  // Get latest model version
  const modelResponse = await fetch("https://api.replicate.com/v1/models/fofr/video-to-frames", {
    headers: { "Authorization": `Bearer ${REPLICATE_API_KEY}` },
  });

  if (!modelResponse.ok) throw new Error(`Failed to fetch model info: ${modelResponse.status}`);
  const modelData = await modelResponse.json();
  const latestVersionId = modelData.latest_version?.id;
  if (!latestVersionId) throw new Error("Could not find model version");

  // Create prediction with retries
  let prediction = null;
  let retryAttempts = 0;

  while (!prediction && retryAttempts < 5) {
    try {
      prediction = await replicate.predictions.create({
        version: latestVersionId,
        input: {
          video: videoUrl,
          fps: EXTRACTION_FPS,
          width: TARGET_WIDTH,
        },
      });
      console.log(`[ProcessChunk] Replicate prediction created: ${prediction.id}`);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429 || status === 502 || status === 503) {
        const delay = 15000 * Math.pow(1.5, retryAttempts);
        console.log(`[ProcessChunk] Retryable error (${status}), waiting ${Math.round(delay / 1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
        retryAttempts++;
      } else {
        throw error;
      }
    }
  }

  if (!prediction) throw new Error("Failed to create prediction after retries");

  // Poll for completion - EXTENDED timeout for large videos streamed through proxy
  // 2GB video at 2Mbps = ~2.5 hours to stream, plus processing time
  const maxWaitTime = 180 * 60 * 1000; // 180 minutes max for multi-GB videos
  const pollInterval = 10000; // Check every 10 seconds
  const startTime = Date.now();
  let lastLogTime = startTime;

  while (Date.now() - startTime < maxWaitTime) {
    const status = await replicate.predictions.get(prediction.id);
    const elapsed = Date.now() - startTime;

    // Update heartbeat
    await supabase.from('courses').update({
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', courseId);

    if (status.status === 'succeeded') {
      const output = status.output || [];
      console.log(`[ProcessChunk] Streaming extraction complete: ${output.length} frames in ${Math.round(elapsed / 60000)} minutes`);
      return output;
    }

    if (status.status === 'failed') {
      throw new Error(`Extraction failed: ${status.error || 'Unknown error'}`);
    }

    // Log progress every 30 seconds (better feedback for long videos)
    if (Date.now() - lastLogTime > 30000) {
      console.log(`[ProcessChunk] Streaming extraction in progress: status=${status.status}, elapsed=${Math.round(elapsed / 60000)}min`);
      lastLogTime = Date.now();

      // Update progress based on time (rough estimate)
      const progressEstimate = Math.min(45, 25 + Math.floor(elapsed / 60000)); // Cap at 45%
      await supabase.from('courses').update({
        progress: progressEstimate,
      }).eq('id', courseId);

      await logEvent(supabase, jobId, 'extraction_progress_ping', 'info',
        `Extraction in progress: ${status.status}, elapsed ${Math.round(elapsed / 1000)}s`
      );
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error('Streaming extraction timed out after 180 minutes');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: ProcessChunkRequest = await req.json().catch(() => ({}));
    const { courseId } = body;

    if (!courseId) {
      return new Response(JSON.stringify({ error: 'courseId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const jobId = courseId;

    // Get course info
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, video_url, storage_path, status, chunked')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: 'Course not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const videoUrl = course.storage_path || course.video_url || '';

    // Check if this is a manifest-based upload and get manifest path
    const manifest = await getManifest(supabase, videoUrl);

    if (!manifest) {
      return new Response(JSON.stringify({
        error: 'Not a chunked upload or manifest not found',
        videoUrl
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get manifest path for streaming proxy
    const match = videoUrl.match(/video-uploads\/(.+?)(?:\?|$)/);
    let manifestPath = '';
    if (match) {
      let basePath = match[1];
      const chunkMatch = basePath.match(/^(.+?)_chunk_\d+$/);
      if (chunkMatch) basePath = chunkMatch[1];
      manifestPath = `${basePath}.manifest.json`;
    }

    await logEvent(supabase, jobId, 'streaming_extraction_start', 'info',
      `Starting streaming proxy extraction for ${manifest.chunkCount} chunks (${(manifest.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB)`,
      { courseId, chunkCount: manifest.chunkCount, totalSize: manifest.totalSize, manifestPath }
    );

    // Update course status
    await supabase.from('courses').update({
      status: 'processing',
      progress: 25,
      progress_step: 'extracting_frames',
      chunked: true,
      chunk_count: manifest.chunkCount,
      completed_chunks: 0,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', courseId);

    // Use streaming proxy to extract frames from the full reassembled video
    // Extract frames using the optimized path (Unified Mega-Video flow)
    const allFrames = await extractFramesViaStreamingProxy(supabase, courseId, manifest, jobId);

    // Save results to course
    await supabase.from('courses').update({
      frame_urls: allFrames,
      total_frames: allFrames.length,
      completed_chunks: manifest.chunkCount,
      progress: 50,
      progress_step: 'transcribing',
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', courseId);

    await logEvent(supabase, jobId, 'streaming_extraction_complete', 'info',
      `Streaming extraction complete: ${allFrames.length} total frames`,
      { courseId, frameCount: allFrames.length, chunkCount: manifest.chunkCount }
    );

    // Update processing queue to move to next step
    await supabase.from('processing_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('course_id', courseId)
      .in('step', ['transcribe_and_extract', 'extract_frames'])
      .eq('status', 'awaiting_webhook');

    // Queue the transcription step
    await supabase.from('processing_queue').insert({
      course_id: courseId,
      step: 'analyze_audio',
      status: 'pending',
      metadata: { afterChunkedExtraction: true }
    });

    return new Response(JSON.stringify({
      success: true,
      courseId,
      frameCount: allFrames.length,
      chunksProcessed: manifest.chunkCount,
      message: `Extracted ${allFrames.length} frames from ${manifest.chunkCount} storage chunks`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ProcessChunk] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Update course with error if courseId is available
    const reqBody: ProcessChunkRequest = await req.clone().json().catch(() => ({}));
    if (reqBody?.courseId) {
      await supabase.from('courses').update({
        status: 'failed',
        error_message: `Frame extraction failed: ${message}`,
        progress_step: 'failed',
      }).eq('id', reqBody.courseId);
    }

    return new Response(JSON.stringify({
      success: false,
      error: message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
