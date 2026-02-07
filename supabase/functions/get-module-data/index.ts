import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Simple in-memory rate limiting (per instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Limit frame URLs to prevent massive JSON responses (Increased for high-density PDF support)
const MAX_FRAME_URLS = 15000;

// Helper: sample frames evenly across the array to represent full video duration
const sampleFramesEvenly = (frames: string[], maxFrames: number): string[] => {
  if (!Array.isArray(frames) || frames.length <= maxFrames) return frames || [];
  const step = frames.length / maxFrames;
  const sampled: string[] = [];
  for (let i = 0; i < maxFrames; i++) {
    const idx = Math.floor(i * step);
    sampled.push(frames[idx]);
  }
  return sampled;
};

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }

  if (record.count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: record.resetTime - now };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_REQUESTS - record.count, resetIn: record.resetTime - now };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const sessionId = req.headers.get("x-session-id") || "anonymous";
    const forwarded = req.headers.get("x-forwarded-for");
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const rateLimitKey = `${clientIp}:${sessionId}`;

    const rateCheck = checkRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { moduleId, courseId, moduleNumber } = await req.json();

    if (!moduleId && !(courseId && moduleNumber)) {
      return new Response(
        JSON.stringify({ error: "Either moduleId or (courseId + moduleNumber) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase
      .from("course_modules")
      .select(`
        id, 
        title, 
        module_number,
        video_duration_seconds, 
        transcript, 
        frame_urls, 
        audio_events,
        prosody_annotations,
        ai_context,
        status,
        module_files,
        course_id,
        transformation_artifact_id,
        transformation_artifacts(
          key_moments_index,
          concepts_frameworks,
          hidden_patterns,
          implementation_steps
        ),
        courses(title, email)
      `);

    if (moduleId) {
      query = query.eq("id", moduleId);
    } else {
      query = query.eq("course_id", courseId).eq("module_number", moduleNumber);
    }

    const { data: module, error } = await query.single();

    if (error || !module) {
      // Fallback: Check if this is actually a single-module course (data on courses table)
      console.log(`[get-module-data] Module not found, checking if it's a single-module course...`);

      const { data: course, error: courseError } = await supabase
        .from("courses")
        .select(`
          id, 
          title, 
          video_duration_seconds, 
          transcript, 
          frame_urls, 
          audio_events,
          prosody_annotations,
          status,
          course_files,
          transformation_artifact_id,
          transformation_artifacts(
            key_moments_index,
            concepts_frameworks,
            hidden_patterns,
            implementation_steps
          )
        `)
        .eq("id", moduleId) // moduleId might actually be a course ID
        .single();

      if (!courseError && course) {
        // Return course data formatted as module data
        const courseFrameUrls = course.frame_urls || [];
        const totalCourseFrameCount = Array.isArray(courseFrameUrls) ? courseFrameUrls.length : 0;
        const limitedCourseFrameUrls = sampleFramesEvenly(courseFrameUrls, MAX_FRAME_URLS);

        console.log(`[get-module-data] Found single-module course: ${course.title}, ${totalCourseFrameCount} frames`);

        return new Response(
          JSON.stringify({
            module: {
              id: course.id,
              title: course.title,
              moduleNumber: 1,
              video_duration_seconds: course.video_duration_seconds,
              transcript: course.transcript,
              frame_urls: limitedCourseFrameUrls,
              total_frame_count: totalCourseFrameCount,
              audio_events: course.audio_events,
              prosody_annotations: course.prosody_annotations,
              course_id: course.id,
              courseTitle: course.title,
              status: course.status,
              isSingleModuleCourse: true,
              isPartial: false,
              isStalled: false,
              hasTranscript: Array.isArray(course.transcript) && course.transcript.length > 0,
              hasFrames: totalCourseFrameCount > 0,
              key_moments_index: (course.transformation_artifacts as any)?.key_moments_index,
              concepts_frameworks: (course.transformation_artifacts as any)?.concepts_frameworks,
              hidden_patterns: (course.transformation_artifacts as any)?.hidden_patterns,
              implementation_steps: (course.transformation_artifacts as any)?.implementation_steps
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error("Error fetching module:", error);
      return new Response(
        JSON.stringify({ error: "Module not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if module has usable data for partial downloads
    const hasTranscript = Array.isArray(module.transcript) && module.transcript.length > 0;
    const hasFrames = Array.isArray(module.frame_urls) && module.frame_urls.length > 0;
    const hasUsableData = hasTranscript || hasFrames;

    // Determine if module is partial (has some data but not completed)
    const isPartial = module.status !== "completed" && hasUsableData;
    const isStalled = module.status !== "completed" && module.status !== "failed" && !["queued", "pending"].includes(module.status);

    // Only block if truly has no usable data AND not completed
    if (module.status !== "completed" && !hasUsableData) {
      return new Response(
        JSON.stringify({
          error: "Module data not ready yet",
          status: module.status,
          hasTranscript,
          hasFrames
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit frame URLs to prevent massive JSON responses (PDF exporter only uses ~100 max)
    // Use even sampling to represent the ENTIRE video, not just the beginning
    const allFrameUrls = module.frame_urls || [];
    const totalFrameCount = Array.isArray(allFrameUrls) ? allFrameUrls.length : 0;
    const limitedFrameUrls = sampleFramesEvenly(allFrameUrls, MAX_FRAME_URLS);

    console.log(`[get-module-data] Module found: ${module.title}, status: ${module.status}, ${totalFrameCount} total frames -> ${limitedFrameUrls.length} sampled evenly, partial: ${isPartial}`);

    return new Response(
      JSON.stringify({
        module: {
          id: module.id,
          title: module.title,
          moduleNumber: module.module_number,
          video_duration_seconds: module.video_duration_seconds,
          transcript: module.transcript,
          frame_urls: limitedFrameUrls,
          total_frame_count: totalFrameCount,
          audio_events: module.audio_events,
          prosody_annotations: module.prosody_annotations,
          ai_context: module.ai_context,
          module_files: module.module_files,
          course_id: module.course_id,
          courseTitle: (module.courses as any)?.title,
          // New fields for UI to show proper status
          status: module.status,
          isPartial,
          isStalled,
          hasTranscript,
          hasFrames,
          key_moments_index: (module.transformation_artifacts as any)?.key_moments_index,
          concepts_frameworks: (module.transformation_artifacts as any)?.concepts_frameworks,
          hidden_patterns: (module.transformation_artifacts as any)?.hidden_patterns,
          implementation_steps: (module.transformation_artifacts as any)?.implementation_steps
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-module-data:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
