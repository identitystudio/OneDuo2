/**
 * Chunk Video Edge Function
 * 
 * Analyzes video duration and creates chunk records for long videos (30+ minutes).
 * Each chunk is a 10-minute segment that can be processed independently.
 * 
 * Flow:
 * 1. Detect video duration (via probe or metadata)
 * 2. If duration > 30 minutes, split into 10-minute chunks
 * 3. Create video_chunks records for each segment
 * 4. Return chunk info for parallel processing
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Chunking constants
const CHUNK_DURATION_SECONDS = 10 * 60; // 10 minutes per chunk
const MIN_DURATION_FOR_CHUNKING = 30 * 60; // 30 minutes threshold
const MAX_PARALLEL_CHUNKS = 10; // Max chunks to process in parallel
const COST_PER_MINUTE_CENTS = 2; // Estimated cost per minute of video

interface ChunkRequest {
  courseId: string;
  moduleId?: string;
  videoPath: string;
  videoDurationSeconds?: number; // If known from client
  forceChunk?: boolean; // Force chunking even for shorter videos
  estimateCostOnly?: boolean; // Just return cost estimate, don't create chunks
}

interface ChunkInfo {
  chunkIndex: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

interface ChunkResponse {
  success: boolean;
  chunked: boolean;
  chunkCount: number;
  chunks?: ChunkInfo[];
  estimatedCostCents?: number;
  videoDurationSeconds: number;
  message: string;
  error?: string;
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
    console.log(`[ChunkVideo][${level}] ${step}: ${message}`);
  } catch (e) {
    console.warn('[ChunkVideo] Failed to log event:', e);
  }
}

/**
 * Estimate video duration from file size if not provided
 * Rough estimate: ~10MB per minute for typical video
 */
function estimateDurationFromSize(fileSizeBytes: number): number {
  const bytesPerMinute = 10 * 1024 * 1024; // 10MB per minute estimate
  return Math.ceil((fileSizeBytes / bytesPerMinute) * 60);
}

/**
 * Get video duration via HTTP HEAD request to check content-length
 * and estimate duration, or probe if available
 */
async function getVideoDuration(
  supabase: SupabaseClient,
  videoPath: string,
  supabaseUrl: string,
  providedDuration?: number
): Promise<number> {
  // If duration was provided, use it
  if (providedDuration && providedDuration > 0) {
    return providedDuration;
  }
  
  // Try to get video URL
  let videoUrl = videoPath;
  if (!videoPath.startsWith('http')) {
    const { data } = await supabase.storage
      .from('video-uploads')
      .createSignedUrl(videoPath, 300);
    videoUrl = data?.signedUrl || '';
  }
  
  if (!videoUrl) {
    console.warn('[ChunkVideo] Could not get video URL for duration check');
    return 0;
  }
  
  // Try HEAD request to get content-length
  try {
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    
    if (contentLength) {
      const sizeBytes = parseInt(contentLength, 10);
      const estimatedDuration = estimateDurationFromSize(sizeBytes);
      console.log(`[ChunkVideo] Estimated duration from file size: ${estimatedDuration}s (${sizeBytes} bytes)`);
      return estimatedDuration;
    }
  } catch (e) {
    console.warn('[ChunkVideo] HEAD request failed:', e);
  }
  
  // Default to 0 (will be detected during processing)
  return 0;
}

/**
 * Calculate chunks for a given duration
 */
function calculateChunks(durationSeconds: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  const chunkCount = Math.ceil(durationSeconds / CHUNK_DURATION_SECONDS);
  
  for (let i = 0; i < chunkCount; i++) {
    const startSeconds = i * CHUNK_DURATION_SECONDS;
    const endSeconds = Math.min((i + 1) * CHUNK_DURATION_SECONDS, durationSeconds);
    
    chunks.push({
      chunkIndex: i,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds
    });
  }
  
  return chunks;
}

/**
 * Calculate estimated cost for processing
 */
function calculateEstimatedCost(durationSeconds: number): number {
  const minutes = Math.ceil(durationSeconds / 60);
  return minutes * COST_PER_MINUTE_CENTS;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: ChunkRequest = await req.json();
    
    if (!body.courseId || !body.videoPath) {
      return new Response(JSON.stringify({
        success: false,
        error: 'courseId and videoPath are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const jobId = `chunk-${body.courseId.slice(0, 8)}-${Date.now()}`;
    
    console.log(`[ChunkVideo] Analyzing video for course ${body.courseId}`);
    await logEvent(supabase, jobId, 'chunk_analysis_start', 'info', 
      'Starting video chunk analysis', 
      { courseId: body.courseId, videoPath: body.videoPath }
    );

    // Get video duration
    const videoDurationSeconds = await getVideoDuration(
      supabase, 
      body.videoPath, 
      supabaseUrl, 
      body.videoDurationSeconds
    );
    
    console.log(`[ChunkVideo] Video duration: ${videoDurationSeconds}s (${Math.round(videoDurationSeconds / 60)} minutes)`);

    // Calculate cost estimate
    const estimatedCostCents = calculateEstimatedCost(videoDurationSeconds);
    
    // If just estimating cost, return early
    if (body.estimateCostOnly) {
      const shouldChunk = videoDurationSeconds >= MIN_DURATION_FOR_CHUNKING || body.forceChunk;
      const chunks = shouldChunk ? calculateChunks(videoDurationSeconds) : [];
      
      return new Response(JSON.stringify({
        success: true,
        chunked: shouldChunk,
        chunkCount: chunks.length,
        chunks,
        estimatedCostCents,
        videoDurationSeconds,
        message: `Estimated cost: $${(estimatedCostCents / 100).toFixed(2)}`
      } as ChunkResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if chunking is needed
    const shouldChunk = videoDurationSeconds >= MIN_DURATION_FOR_CHUNKING || body.forceChunk;
    
    if (!shouldChunk) {
      // Short video - no chunking needed
      await logEvent(supabase, jobId, 'chunk_analysis_complete', 'info',
        `Video is under ${MIN_DURATION_FOR_CHUNKING / 60} minutes, no chunking needed`,
        { videoDurationSeconds, estimatedCostCents }
      );
      
      // Update course with cost estimate
      await supabase
        .from('courses')
        .update({
          chunked: false,
          estimated_cost_cents: estimatedCostCents,
          video_duration_seconds: videoDurationSeconds,
          updated_at: new Date().toISOString()
        })
        .eq('id', body.courseId);
      
      return new Response(JSON.stringify({
        success: true,
        chunked: false,
        chunkCount: 0,
        estimatedCostCents,
        videoDurationSeconds,
        message: 'Video is short enough for single-pass processing'
      } as ChunkResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate chunks
    const chunks = calculateChunks(videoDurationSeconds);
    
    console.log(`[ChunkVideo] Creating ${chunks.length} chunks for ${videoDurationSeconds}s video`);
    await logEvent(supabase, jobId, 'chunk_creation_start', 'info',
      `Creating ${chunks.length} chunks`,
      { chunkCount: chunks.length, videoDurationSeconds, estimatedCostCents }
    );

    // Create chunk records in database
    const chunkRecords = chunks.map(chunk => ({
      course_id: body.courseId,
      module_id: body.moduleId || null,
      chunk_index: chunk.chunkIndex,
      total_chunks: chunks.length,
      start_seconds: chunk.startSeconds,
      end_seconds: chunk.endSeconds,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Insert all chunks
    const { error: insertError } = await supabase
      .from('video_chunks')
      .insert(chunkRecords);

    if (insertError) {
      // Check if chunks already exist (idempotent)
      if (insertError.code === '23505') {
        console.log(`[ChunkVideo] Chunks already exist for course ${body.courseId}`);
        
        // Get existing chunks
        const { data: existingChunks } = await supabase
          .from('video_chunks')
          .select('chunk_index, start_seconds, end_seconds, status')
          .eq('course_id', body.courseId)
          .order('chunk_index', { ascending: true });
        
        return new Response(JSON.stringify({
          success: true,
          chunked: true,
          chunkCount: existingChunks?.length || chunks.length,
          chunks: existingChunks?.map(c => ({
            chunkIndex: c.chunk_index,
            startSeconds: c.start_seconds,
            endSeconds: c.end_seconds,
            durationSeconds: c.end_seconds - c.start_seconds
          })),
          estimatedCostCents,
          videoDurationSeconds,
          message: 'Chunks already exist'
        } as ChunkResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw insertError;
    }

    // Update course with chunking info
    await supabase
      .from('courses')
      .update({
        chunked: true,
        chunk_count: chunks.length,
        completed_chunks: 0,
        chunking_strategy: `10min-parallel-${MAX_PARALLEL_CHUNKS}`,
        estimated_cost_cents: estimatedCostCents,
        video_duration_seconds: videoDurationSeconds,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.courseId);

    // If module, update module too
    if (body.moduleId) {
      await supabase
        .from('course_modules')
        .update({
          chunked: true,
          chunk_count: chunks.length,
          completed_chunks: 0,
          video_duration_seconds: videoDurationSeconds,
          updated_at: new Date().toISOString()
        })
        .eq('id', body.moduleId);
    }

    await logEvent(supabase, jobId, 'chunk_creation_complete', 'info',
      `Created ${chunks.length} chunks successfully`,
      { 
        chunkCount: chunks.length, 
        videoDurationSeconds, 
        estimatedCostCents,
        chunkDuration: CHUNK_DURATION_SECONDS
      }
    );

    return new Response(JSON.stringify({
      success: true,
      chunked: true,
      chunkCount: chunks.length,
      chunks,
      estimatedCostCents,
      videoDurationSeconds,
      message: `Created ${chunks.length} chunks for parallel processing`
    } as ChunkResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ChunkVideo] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      chunked: false,
      chunkCount: 0,
      videoDurationSeconds: 0,
      error: error instanceof Error ? error.message : 'Failed to analyze/chunk video',
      message: 'Chunking failed'
    } as ChunkResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
