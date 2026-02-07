/**
 * Merge Chunks Edge Function
 * 
 * Merges all completed chunks into a single unified artifact.
 * Called automatically when all chunks are complete.
 * 
 * Flow:
 * 1. Verify all chunks are completed
 * 2. Gather frame URLs from all chunks in order
 * 3. Combine transcripts if available
 * 4. Generate unified PDF artifact
 * 5. Update course status to completed
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FRAMES_PER_PDF_PAGE = 4;

interface MergeRequest {
  courseId: string;
  moduleId?: string;
  forceMerge?: boolean; // Merge even if some chunks failed
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
    console.log(`[MergeChunks][${level}] ${step}: ${message}`);
  } catch (e) {
    console.warn('[MergeChunks] Failed to log event:', e);
  }
}

/**
 * Format timestamp as MM:SS
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generate basic PDF content from merged frames
 * This creates a placeholder - actual PDF generation would use jsPDF or similar
 */
async function generateMergedPdfContent(
  frames: { url: string; timestamp: number; chunkIndex: number }[],
  courseTitle: string,
  totalDuration: number
): Promise<string> {
  // For now, return metadata that can be used by PDF generation
  // In production, this would generate actual PDF bytes
  return JSON.stringify({
    title: courseTitle,
    totalFrames: frames.length,
    totalDuration,
    durationFormatted: formatTimestamp(totalDuration),
    frameCount: frames.length,
    generatedAt: new Date().toISOString(),
    frames: frames.slice(0, 15000).map(f => ({ // Sample up to 15,000 frames
      url: f.url,
      timestamp: f.timestamp,
      timestampFormatted: formatTimestamp(f.timestamp),
      chunkIndex: f.chunkIndex
    }))
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: MergeRequest = await req.json();

    if (!body.courseId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'courseId is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const jobId = `merge-${body.courseId.slice(0, 8)}-${Date.now()}`;

    console.log(`[MergeChunks] Starting merge for course ${body.courseId}`);
    await logEvent(supabase, jobId, 'merge_start', 'info',
      'Starting chunk merge',
      { courseId: body.courseId, moduleId: body.moduleId }
    );

    // Check chunk completion status
    const { data: completion } = await supabase
      .rpc('check_chunks_complete', {
        p_course_id: body.courseId,
        p_module_id: body.moduleId
      });

    if (!completion || completion.length === 0) {
      throw new Error('No chunks found for this course');
    }

    const status = completion[0];

    console.log(`[MergeChunks] Chunk status: ${status.completed_chunks}/${status.total_chunks} complete, ${status.failed_chunks} failed`);

    // Check if all chunks are complete
    if (!status.all_complete && !body.forceMerge) {
      if (status.failed_chunks > 0) {
        await logEvent(supabase, jobId, 'merge_blocked', 'warn',
          `Cannot merge: ${status.failed_chunks} chunks failed`,
          {
            totalChunks: status.total_chunks,
            completedChunks: status.completed_chunks,
            failedChunks: status.failed_chunks
          }
        );

        return new Response(JSON.stringify({
          success: false,
          error: `${status.failed_chunks} chunks failed. Use forceMerge to proceed anyway.`,
          status: {
            totalChunks: status.total_chunks,
            completedChunks: status.completed_chunks,
            failedChunks: status.failed_chunks
          }
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: 'Not all chunks are complete',
        status: {
          totalChunks: status.total_chunks,
          completedChunks: status.completed_chunks,
          failedChunks: status.failed_chunks
        }
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get all completed chunks in order
    const { data: chunks, error: chunksError } = await supabase
      .from('video_chunks')
      .select('*')
      .eq('course_id', body.courseId)
      .eq('status', 'completed')
      .order('chunk_index', { ascending: true });

    if (chunksError || !chunks || chunks.length === 0) {
      throw new Error('Failed to fetch completed chunks');
    }

    console.log(`[MergeChunks] Merging ${chunks.length} chunks`);
    await logEvent(supabase, jobId, 'merge_chunks_loaded', 'info',
      `Loaded ${chunks.length} completed chunks for merge`,
      { chunkCount: chunks.length }
    );

    // Gather all frames from all chunks
    const allFrames: { url: string; timestamp: number; chunkIndex: number }[] = [];
    let totalDuration = 0;

    for (const chunk of chunks) {
      const frameUrls = (chunk.frame_urls as string[]) || [];
      const chunkDuration = chunk.end_seconds - chunk.start_seconds;

      // Calculate timestamps for each frame
      frameUrls.forEach((url, frameIndex) => {
        const framesPerSecond = 3; // Our standard FPS
        const relativeTime = frameIndex / framesPerSecond;
        const absoluteTime = chunk.start_seconds + relativeTime;

        allFrames.push({
          url,
          timestamp: absoluteTime,
          chunkIndex: chunk.chunk_index
        });
      });

      totalDuration = Math.max(totalDuration, chunk.end_seconds);
    }

    console.log(`[MergeChunks] Collected ${allFrames.length} frames spanning ${totalDuration}s`);

    // Get course info
    const { data: course } = await supabase
      .from('courses')
      .select('title, user_id')
      .eq('id', body.courseId)
      .single();

    // Generate merged artifact
    const pdfContent = await generateMergedPdfContent(
      allFrames,
      course?.title || 'Untitled',
      totalDuration
    );

    // Store merged artifact
    const storagePath = `merged-artifacts/${body.courseId}/artifact.json`;

    const { error: uploadError } = await supabase.storage
      .from('course-files')
      .upload(storagePath, pdfContent, {
        contentType: 'application/json',
        upsert: true
      });

    if (uploadError) {
      console.warn(`[MergeChunks] Failed to upload artifact: ${uploadError.message}`);
    }

    // Get signed URL for artifact
    const { data: signedData } = await supabase.storage
      .from('course-files')
      .createSignedUrl(storagePath, 7 * 24 * 3600); // 7 days

    // Update all chunks to 'merged' status
    await supabase
      .from('video_chunks')
      .update({
        status: 'merged',
        updated_at: new Date().toISOString()
      })
      .eq('course_id', body.courseId)
      .eq('status', 'completed');

    // Update course to completed
    await supabase
      .from('courses')
      .update({
        status: 'completed',
        progress: 100,
        progress_step: 'completed',
        completed_at: new Date().toISOString(),
        course_files: [{
          name: 'OneDuo Artifact',
          storagePath,
          type: 'artifact'
        }],
        frame_urls: allFrames.slice(0, 15000).map(f => f.url), // Store sample for preview
        total_frames: allFrames.length,
        video_duration_seconds: totalDuration,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.courseId);

    // Update module if applicable
    if (body.moduleId) {
      await supabase
        .from('course_modules')
        .update({
          status: 'completed',
          progress: 100,
          completed_at: new Date().toISOString(),
          frame_urls: allFrames.slice(0, 15000).map(f => f.url),
          total_frames: allFrames.length,
          updated_at: new Date().toISOString()
        })
        .eq('id', body.moduleId);
    }

    await logEvent(supabase, jobId, 'merge_complete', 'info',
      `Successfully merged ${chunks.length} chunks into unified artifact`,
      {
        courseId: body.courseId,
        totalFrames: allFrames.length,
        totalDuration,
        storagePath,
        chunkCount: chunks.length
      }
    );

    return new Response(JSON.stringify({
      success: true,
      courseId: body.courseId,
      totalChunks: chunks.length,
      totalFrames: allFrames.length,
      totalDuration,
      artifactPath: storagePath,
      artifactUrl: signedData?.signedUrl,
      message: `Successfully merged ${chunks.length} chunks into unified artifact`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[MergeChunks] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Merge failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
