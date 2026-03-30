import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * RunPod Webhook Handler
 *
 * Receives callbacks from our RunPod FFmpeg worker when frame extraction completes.
 * Unlike replicate-webhook, frames are ALREADY in Supabase Storage (uploaded by handler.py),
 * so no download/re-upload step is needed here — just update the DB and queue the next step.
 *
 * Flow:
 * 1. extract-frames-ffmpeg / process-course submits a RunPod job with webhookUrl pointing here
 * 2. RunPod worker extracts frames via FFmpeg, uploads to Supabase Storage
 * 3. Worker calls this webhook with permanent frame URLs
 * 4. We update the DB and queue the next pipeline step
 */

async function logJobEvent(
  supabase: any,
  jobId: string,
  payload: { step: string; level?: string; message?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  try {
    await supabase.from("job_logs").insert({
      job_id: jobId,
      step: payload.step,
      level: payload.level || "info",
      message: payload.message || null,
      metadata: { ...payload.metadata, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    console.warn(`[logJobEvent] Failed: ${e}`);
  }
}

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();

    console.log(`[runpod-webhook] Received:`, JSON.stringify(body).substring(0, 500));

    // RunPod worker sends: { output: { frameUrls, frameCount, duration, courseId, recordId, tableName }, status, source }
    const status = body.status; // "completed" or "error"
    const output = body.output || {};
    const errorMsg = body.error || output.error;

    const courseId = output.courseId;
    const recordId = output.recordId || courseId;
    const tableName = output.tableName || "courses";
    const frameUrls: string[] = output.frameUrls || [];
    const frameCount: number = output.frameCount || frameUrls.length;
    const step = output.step; // e.g. "extract_frames" or "extract_frames_module"

    if (!courseId || !recordId) {
      console.error(`[runpod-webhook] Missing courseId/recordId in payload`);
      return new Response(JSON.stringify({ received: true, error: "Missing metadata" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logJobId = tableName === "courses"
      ? `course-${courseId.slice(0, 8)}`
      : `module-${recordId.slice(0, 8)}`;

    await logJobEvent(supabase, logJobId, {
      step: "runpod_webhook_received",
      level: "info",
      message: `RunPod webhook received: ${status}`,
      metadata: { status, course_id: courseId, record_id: recordId, table_name: tableName, frame_count: frameCount },
    });

    // ========== merge_pdf COMPLETION ==========
    if (output.step === "merge_pdf") {
      const storagePath: string = output.storagePath;
      const courseTitle: string = output.courseTitle || "";
      const userEmail: string   = output.userEmail || "";
      const totalParts: number  = output.totalParts || 0;
      const totalFrames: number = output.totalFrames || 0;
      const mergedSize: number  = output.mergedSize || 0;

      if (status === "error" || status === "FAILED") {
        console.error(`[runpod-webhook] merge_pdf failed: ${output.error || "unknown"}`);
        await supabase.from("courses").update({
          pdf_generation_status: "failed",
          pdf_generation_progress: { failedAt: new Date().toISOString(), error: output.error || "RunPod merge failed" },
        }).eq("id", courseId);
        return new Response(JSON.stringify({ received: true, status: "merge_failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const filename = `${courseTitle} - Visual Transcription.pdf`;

      // Fetch existing course_files and share_token for email URL
      const { data: courseRow } = await supabase.from("courses")
        .select("course_files, share_token, email")
        .eq("id", courseId)
        .single();

      const existingFiles: any[] = (courseRow?.course_files as any[]) || [];
      const shareToken: string = courseRow?.share_token || "";

      await supabase.from("courses").update({
        course_files: [
          ...existingFiles.filter((f: any) => f?.type !== "visual_transcription_pdf"),
          {
            type: "visual_transcription_pdf",
            name: filename,
            filename,
            storagePath,
            storage_path: `course-files/${storagePath}`,
            size: mergedSize,
            uploaded_at: new Date().toISOString(),
            total_parts: totalParts,
            total_frames: totalFrames,
            generated_by: "runpod",
          },
        ],
        pdf_revision_pending: false,
        share_enabled: true,
        pdf_generation_status: "complete",
        pdf_generation_progress: { currentPart: totalParts, totalParts, currentFrame: totalFrames, totalFrames, completedAt: new Date().toISOString() },
      }).eq("id", courseId);

      console.log(`[runpod-webhook] merge_pdf complete — ${storagePath}`);

      // Clean up preamble + part checkpoint files
      const cleanupPaths = [
        `exports/${courseId}/preamble.pdf`,
        ...Array.from({ length: totalParts }, (_, i) => `exports/${courseId}/parts/part_${i + 1}_of_${totalParts}.pdf`),
      ];
      await supabase.storage.from("course-files").remove(cleanupPaths).catch((e: any) => {
        console.warn(`[runpod-webhook] Cleanup warning (non-fatal):`, e);
      });

      // Send email
      if (userEmail) {
        try {
          const functionsUrl = supabaseUrl.replace(".supabase.co", ".functions.supabase.co");
          const downloadUrl = `${functionsUrl}/track-download?courseId=${courseId}&source=email${shareToken ? `&token=${shareToken}` : ""}`;
          await fetch(`${supabaseUrl}/functions/v1/send-pdf-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ email: userEmail, courseTitle, downloadUrl, courseId }),
          });
          console.log(`[runpod-webhook] Email sent to ${userEmail}`);
        } catch (emailError) {
          console.error("[runpod-webhook] Email failed:", emailError);
        }
      }

      return new Response(JSON.stringify({ received: true, status: "merge_complete" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== ERROR HANDLING ==========
    if (status === "error" || status === "FAILED") {
      console.error(`[runpod-webhook] Job failed: ${errorMsg}`);

      await logJobEvent(supabase, logJobId, {
        step: "runpod_frame_extraction_failed",
        level: "error",
        message: `RunPod frame extraction failed: ${errorMsg}`,
        metadata: { course_id: courseId, record_id: recordId },
      });

      // Reset queue job to pending for retry
      const { data: failedJob } = await supabase
        .from("processing_queue")
        .select("id, attempt_count, max_attempts")
        .eq("course_id", courseId)
        .in("status", ["awaiting_webhook", "processing"])
        .in("step", ["extract_frames", "extract_frames_module", "transcribe_and_extract", "transcribe_and_extract_module"])
        .eq("purged", false)
        .maybeSingle();

      const attemptCount = failedJob?.attempt_count ?? 0;
      const maxAttempts = failedJob?.max_attempts ?? 3;

      if (attemptCount < maxAttempts - 1 && failedJob) {
        await supabase.from("processing_queue").update({
          status: "pending",
          started_at: null,
          attempt_count: attemptCount + 1,
          error_message: `RunPod error: ${errorMsg} — retrying`,
        }).eq("id", failedJob.id);
        await supabase.functions.invoke("process-course", { body: { action: "poll" } }).catch(() => {});
        console.log(`[runpod-webhook] Queued retry ${attemptCount + 1}/${maxAttempts - 1}`);
      } else {
        await supabase.from(tableName).update({ status: "manual_review", progress_step: "error" }).eq("id", recordId);
        console.error(`[runpod-webhook] Max retries reached — escalating to manual_review`);
      }

      return new Response(JSON.stringify({ received: true, status: "error_handled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== SUCCESS HANDLING ==========
    if (status !== "completed" && status !== "COMPLETED") {
      return new Response(JSON.stringify({ received: true, status: "acknowledged" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[runpod-webhook] Extraction succeeded: ${frameCount} frames already in Supabase Storage`);

    // Idempotency check — skip if course already completed with adequate frames
    const { data: currentRecord } = await supabase.from(tableName)
      .select("status, frame_urls, progress")
      .eq("id", recordId)
      .single();

    const existingFrameCount = Array.isArray(currentRecord?.frame_urls) ? currentRecord.frame_urls.length : 0;
    const isAlreadyCompleted = currentRecord?.status === "completed";

    if (isAlreadyCompleted && existingFrameCount >= frameCount) {
      console.log(`[runpod-webhook] IDEMPOTENT SKIP: already completed with ${existingFrameCount} frames`);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Frames are already in permanent Supabase Storage — just save URLs to DB
    const frameUpdatePayload: Record<string, unknown> = {
      frame_urls: frameUrls,
      total_frames: frameCount,
      progress: isAlreadyCompleted ? currentRecord.progress : 50,
      last_heartbeat_at: new Date().toISOString(),
    };
    // constraint_status only exists on courses table
    if (tableName === "courses") {
      frameUpdatePayload.constraint_status = "valid";
    }

    const { error: updateError } = await supabase.from(tableName).update(frameUpdatePayload).eq("id", recordId);
    if (updateError) {
      console.error(`[runpod-webhook] DB update failed:`, updateError.message);
    } else {
      console.log(`[runpod-webhook] Saved ${frameCount} frame URLs to DB`);
    }

    await logJobEvent(supabase, logJobId, {
      step: "frame_extraction_complete",
      level: "info",
      message: `RunPod FFmpeg extraction complete: ${frameCount} frames saved`,
      metadata: { frame_count: frameCount, course_id: courseId, record_id: recordId },
    });

    // Mark queue job as completed
    const { data: updatedRows } = await supabase.from("processing_queue")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("course_id", courseId)
      .in("status", ["awaiting_webhook", "processing"])
      .in("step", ["extract_frames", "extract_frames_module", "transcribe_and_extract", "transcribe_and_extract_module"])
      .select("id");

    if (!updatedRows || updatedRows.length === 0) {
      console.warn(`[runpod-webhook] Queue job update affected 0 rows for course ${courseId}`);
    } else {
      console.log(`[runpod-webhook] Marked ${updatedRows.length} queue job(s) as completed`);
    }

    // Determine next step
    const nextStep = step?.includes("module") ? "analyze_audio_module" : "analyze_audio";

    // Check if next step already queued (prevent duplicates)
    const { data: existingJob } = await supabase
      .from("processing_queue")
      .select("id, status")
      .eq("course_id", courseId)
      .eq("step", nextStep)
      .in("status", ["completed", "processing", "pending"])
      .eq("purged", false)
      .maybeSingle();

    if (existingJob) {
      console.log(`[runpod-webhook] ${nextStep} already exists (${existingJob.status}), skipping`);
      return new Response(JSON.stringify({ received: true, skipped: true, reason: "step_already_exists" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if transcript is ready
    const { data: record } = await supabase.from(tableName)
      .select("transcript")
      .eq("id", recordId)
      .single();

    const hasTranscript = Array.isArray(record?.transcript) && record.transcript.length > 0;
    const canProceed = hasTranscript || step === "extract_frames" || step === "extract_frames_module";

    if (canProceed) {
      await supabase.from(tableName).update({
        progress_step: "analyzing",
        last_heartbeat_at: new Date().toISOString(),
      }).eq("id", recordId);

      await queueNextStep(supabase, courseId, nextStep, {
        moduleNumber: output.moduleNumber,
        completedViaWebhook: true,
        framesOnlyMode: !hasTranscript,
      });
      await supabase.functions.invoke("process-course", { body: { action: "poll" } }).catch(() => {});
    } else {
      // Poll for transcript up to 30 seconds
      console.log(`[runpod-webhook] Frames ready but transcript not yet available — polling...`);
      let transcriptReady = false;
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: recheck } = await supabase.from(tableName).select("transcript").eq("id", recordId).single();
        if (Array.isArray(recheck?.transcript) && recheck.transcript.length > 0) {
          transcriptReady = true;
          console.log(`[runpod-webhook] Transcript ready after ${(i + 1) * 5}s`);
          break;
        }
      }

      await supabase.from(tableName).update({ progress_step: "analyzing" }).eq("id", recordId);
      await queueNextStep(supabase, courseId, nextStep, {
        moduleNumber: output.moduleNumber,
        completedViaWebhook: true,
        framesOnlyMode: !transcriptReady,
        transcriptionSkipped: !transcriptReady,
      });
      await supabase.functions.invoke("process-course", { body: { action: "poll" } }).catch(() => {});
    }

    return new Response(JSON.stringify({ received: true, status: "processed", frames: frameCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[runpod-webhook] Error:", error);
    return new Response(JSON.stringify({ received: true, error: error instanceof Error ? error.message : "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
