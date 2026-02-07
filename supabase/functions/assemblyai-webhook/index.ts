import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * AssemblyAI Webhook Handler
 * 
 * This endpoint receives callbacks from AssemblyAI when transcription jobs complete.
 * It eliminates the need for long-polling inside the main process-course function,
 * making the system more robust for long videos (2+ hours).
 * 
 * Flow:
 * 1. process-course starts an AssemblyAI transcription with webhook URL pointing here
 * 2. process-course returns immediately (no blocking poll loop)
 * 3. AssemblyAI calls this webhook when transcription completes
 * 4. This webhook updates the DB and queues the next processing step (if frames also ready)
 */

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

// Log to job_logs table for forensic debugging
async function logJobEvent(
  supabase: any,
  jobId: string,
  payload: { step: string; level?: string; message?: string; errorReason?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  try {
    await supabase.from('job_logs').insert({
      job_id: jobId,
      step: payload.step,
      level: payload.level || 'info',
      message: payload.message || null,
      error_reason: payload.errorReason || null,
      metadata: {
        ...payload.metadata,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (e) {
    console.warn(`[logJobEvent] Failed to log event for ${jobId}:`, e);
  }
}

// Queue the next processing step
async function queueNextStep(
  supabase: any,
  courseId: string,
  nextStep: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const { error } = await supabase.from("processing_queue").insert({
      course_id: courseId,
      step: nextStep,
      status: "pending",
      metadata,
    });

    if (error) {
      console.error(`[queueNextStep] Failed to queue ${nextStep}:`, error);
      return false;
    }

    console.log(`[queueNextStep] Queued ${nextStep} for course ${courseId}`);
    return true;
  } catch (e) {
    console.error(`[queueNextStep] Exception:`, e);
    return false;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the webhook payload
    const body = await req.json();
    console.log(`[assemblyai-webhook] Received webhook:`, JSON.stringify(body).substring(0, 500));

    // AssemblyAI webhook payload structure
    const transcriptId = body.transcript_id;
    const status = body.status; // "completed", "error"

    // Get the full transcript data if completed
    let transcriptData = null;
    if (status === "completed" && transcriptId) {
      const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
      if (ASSEMBLYAI_API_KEY) {
        const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: { "Authorization": ASSEMBLYAI_API_KEY },
        });
        if (response.ok) {
          transcriptData = await response.json();
        }
      }
    }

    // Our metadata is in the webhook URL query params (passed when we created the job)
    const url = new URL(req.url);
    const courseId = url.searchParams.get("courseId") || body.webhook_metadata?.courseId;
    const recordId = url.searchParams.get("recordId") || body.webhook_metadata?.recordId;
    const tableName = url.searchParams.get("tableName") || body.webhook_metadata?.tableName || "courses";
    const moduleNumber = url.searchParams.get("moduleNumber") || body.webhook_metadata?.moduleNumber;
    const step = url.searchParams.get("step") || body.webhook_metadata?.step;

    if (!courseId || !recordId) {
      console.error(`[assemblyai-webhook] Missing required metadata`);
      return new Response(JSON.stringify({
        received: true,
        error: "Missing metadata - webhook ignored"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logJobId = tableName === 'courses'
      ? `course-${courseId.slice(0, 8)}`
      : `module-${recordId.slice(0, 8)}`;

    // Log webhook receipt
    await logJobEvent(supabase, logJobId, {
      step: 'assemblyai_webhook_received',
      level: 'info',
      message: `AssemblyAI webhook received: ${status}`,
      metadata: {
        transcript_id: transcriptId,
        status,
        course_id: courseId,
        record_id: recordId,
        table_name: tableName,
      }
    });

    if (status === "completed" && transcriptData) {
      // Parse transcript segments
      const segments: TranscriptSegment[] = transcriptData.utterances?.map((u: any) => ({
        start: u.start / 1000,
        end: u.end / 1000,
        text: u.text,
      })) || [];

      const audioDuration = transcriptData.audio_duration;

      console.log(`[assemblyai-webhook] Transcription completed: ${segments.length} segments, ${audioDuration}s duration`);

      // Update the course/module with transcript
      await supabase.from(tableName).update({
        transcript: segments,
        video_duration_seconds: audioDuration,
        progress: 20,
      }).eq("id", recordId);

      // Log completion
      await logJobEvent(supabase, logJobId, {
        step: 'transcription_complete',
        level: 'info',
        message: `Transcription completed via webhook: ${segments.length} segments`,
        metadata: {
          transcript_id: transcriptId,
          segment_count: segments.length,
          duration_seconds: audioDuration,
        }
      });

      // Check if frames are already extracted (if applicable)
      let hasFrames = false;
      if (tableName !== 'transformation_artifacts') {
        const { data: record } = await supabase.from(tableName)
          .select("frame_urls")
          .eq("id", recordId)
          .single();
        hasFrames = Array.isArray(record?.frame_urls) && record.frame_urls.length > 0;
      } else {
        // For transformation artifacts, transcription is independent of frame extraction
        hasFrames = true; // Optimization: allow completion even without frames check
      }


      if (hasFrames) {
        // Both transcription and frames are ready - queue next step
        console.log(`[assemblyai-webhook] Both transcription and frames ready, queueing next step`);


        // Queue next step
        let nextStep = "analyze_audio";
        if (tableName === 'transformation_artifacts') {
          nextStep = "finalize_transformation"; // Custom step or just skip
        } else if (step?.includes("module") || moduleNumber) {
          nextStep = "analyze_audio_module";
        }

        if (tableName === 'transformation_artifacts') {
          // For artifacts, we just update status to completed if appropriate
          await supabase.from("transformation_artifacts").update({
            status: "completed",
            progress: 100
          }).eq("id", recordId);
          return new Response(JSON.stringify({ received: true, status: "completed_artifact" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }


        // CRITICAL FIX: Check if next step already exists - prevent duplicate queue jobs
        const { data: existingJob } = await supabase
          .from("processing_queue")
          .select("id, status")
          .eq("course_id", courseId)
          .eq("step", nextStep)
          .in("status", ["completed", "processing", "pending"])
          .eq("purged", false)
          .maybeSingle();

        if (existingJob) {
          console.log(`[assemblyai-webhook] ${nextStep} already exists (status: ${existingJob.status}), skipping queue`);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'step_already_exists' }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // FIX: Update progress_step to 'analyzing' for UI tracking
        await supabase.from(tableName).update({
          progress_step: "analyzing",
        }).eq("id", recordId);

        // Mark current job as completed
        // FIX: Accept both 'awaiting_webhook' and 'processing' status to handle race conditions
        const { data: updatedRows } = await supabase.from("processing_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString()
          })
          .eq("course_id", courseId)
          .in("status", ["awaiting_webhook", "processing"])
          .in("step", ["transcribe", "transcribe_module", "transcribe_and_extract", "transcribe_and_extract_module"])
          .select("id");

        // Log if no rows were updated
        if (!updatedRows || updatedRows.length === 0) {
          console.warn(`[assemblyai-webhook] WARNING: Queue job update affected 0 rows for course ${courseId}`);
          await logJobEvent(supabase, logJobId, {
            step: 'queue_update_zero_rows',
            level: 'warn',
            message: `Queue job completion update affected 0 rows - possible status mismatch`,
            metadata: { course_id: courseId, attempted_statuses: ['awaiting_webhook', 'processing'] }
          });
        } else {
          console.log(`[assemblyai-webhook] Marked ${updatedRows.length} queue job(s) as completed`);
        }

        await queueNextStep(supabase, courseId, nextStep, {
          moduleNumber: moduleNumber ? parseInt(moduleNumber) : undefined,
          completedViaWebhook: true
        });

        // Trigger the worker
        await supabase.functions.invoke('process-course', {
          body: { action: 'poll' }
        }).catch(() => { });

      } else {
        // Frames not ready yet - poll briefly for them (frame extraction is usually fast for short videos)
        console.log(`[assemblyai-webhook] Transcription ready but frames not yet available. Will poll for frames...`);

        let framesReady = false;
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds

          const { data: recheckRecord } = await supabase.from(tableName)
            .select("frame_urls")
            .eq("id", recordId)
            .single();

          if (Array.isArray(recheckRecord?.frame_urls) && recheckRecord.frame_urls.length > 0) {
            framesReady = true;
            console.log(`[assemblyai-webhook] Frames now available (${recheckRecord.frame_urls.length}) after ${(i + 1) * 5}s delay`);
            break;
          }
        }

        if (framesReady) {
          // Queue next step now that frames are ready
          let nextStep = "analyze_audio";
          if (step?.includes("module") || moduleNumber) {
            nextStep = "analyze_audio_module";
          }

          // FIX: Update progress_step to 'analyzing' for UI tracking
          await supabase.from(tableName).update({
            progress_step: "analyzing",
          }).eq("id", recordId);

          // Mark queue job complete
          await supabase.from("processing_queue")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("course_id", courseId)
            .in("status", ["awaiting_webhook", "processing"])
            .in("step", ["transcribe", "transcribe_module", "transcribe_and_extract", "transcribe_and_extract_module"]);

          console.log(`[assemblyai-webhook] Proceeding to ${nextStep} after frames became available`);
          await queueNextStep(supabase, courseId, nextStep, {
            moduleNumber: moduleNumber ? parseInt(moduleNumber) : undefined,
            completedViaWebhook: true,
          });
          await supabase.functions.invoke('process-course', { body: { action: 'poll' } }).catch(() => { });
        } else {
          // Frames still not ready after 30s - the replicate-webhook will handle it when frames arrive
          console.log(`[assemblyai-webhook] Frames not ready after 30s - replicate-webhook will handle continuation`);
          await logJobEvent(supabase, logJobId, {
            step: 'transcription_waiting_for_frames',
            level: 'warn',
            message: 'Transcription complete but frames not ready after 30s - waiting for replicate-webhook',
            metadata: { course_id: courseId, record_id: recordId }
          });
        }
      }

      return new Response(JSON.stringify({
        received: true,
        status: "processed",
        segments_stored: segments.length
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (status === "error") {
      const errorMsg = body.error || "Transcription failed";
      console.error(`[assemblyai-webhook] Transcription error:`, errorMsg);

      // Log failure
      await logJobEvent(supabase, logJobId, {
        step: 'transcription_failed',
        level: 'error',
        message: `Transcription failed via webhook`,
        errorReason: errorMsg,
        metadata: {
          transcript_id: transcriptId,
        }
      });

      // For transcription failures, we can still continue with frames only
      // Just store empty transcript and let the pipeline continue
      // NOTE: Don't try to update step_completed - it doesn't exist on courses table
      await supabase.from(tableName).update({
        transcript: [],
        video_duration_seconds: 300, // Default estimate
      }).eq("id", recordId);

      // Check if frames are ready to continue
      const { data: record } = await supabase.from(tableName)
        .select("frame_urls")
        .eq("id", recordId)
        .single();

      if (Array.isArray(record?.frame_urls) && record.frame_urls.length > 0) {
        // Frames are ready - continue processing despite transcription failure
        let nextStep = step?.includes("module") ? "analyze_audio_module" : "analyze_audio";
        await queueNextStep(supabase, courseId, nextStep, {
          moduleNumber: moduleNumber ? parseInt(moduleNumber) : undefined,
          transcriptionFailed: true
        });

        await supabase.functions.invoke('process-course', {
          body: { action: 'poll' }
        }).catch(() => { });
      }

      return new Response(JSON.stringify({
        received: true,
        status: "error_handled",
        continued: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown status
    return new Response(JSON.stringify({
      received: true,
      status: "acknowledged"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[assemblyai-webhook] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(JSON.stringify({
      received: true,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
