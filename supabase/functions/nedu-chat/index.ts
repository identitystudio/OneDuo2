import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface NeduAction {
  id: string;
  label: string;
  description: string;
  actionType: "fix_stall" | "retry_course" | "retry_module" | "check_status" | "contact_support" | "tell_more" | "confirm_done";
  courseId?: string;
  moduleId?: string;
  topic?: string;
}

interface ModuleInfo {
  id: string;
  title: string;
  status: string;
  progress: number;
  processing_state: string;
  last_error: string | null;
  retry_count: number;
  module_number: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, email, conversationHistory = [] } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch user's course status for context
    let courseContext = "";
    let stalledCourses: any[] = [];
    let processingCourses: any[] = [];
    let failedCourses: any[] = [];
    let moduleBreakdown = "";
    let errorDetails = "";

    if (email) {
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title, status, progress, error_message, last_heartbeat_at, updated_at, video_duration_seconds, is_multi_module, module_count")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(10);

      if (courses && courses.length > 0) {
        const now = Date.now();
        const twoMinutes = 2 * 60 * 1000;
        const relevantCourseIds: string[] = [];

        for (const course of courses) {
          const isProcessing = !["completed", "failed"].includes(course.status);

          if (isProcessing) {
            const lastActivity = course.last_heartbeat_at
              ? new Date(course.last_heartbeat_at).getTime()
              : new Date(course.updated_at).getTime();

            const isStalled = (now - lastActivity) > twoMinutes;

            if (isStalled) {
              stalledCourses.push(course);
              relevantCourseIds.push(course.id);
            } else {
              processingCourses.push(course);
              relevantCourseIds.push(course.id);
            }
          } else if (course.status === "failed") {
            failedCourses.push(course);
            relevantCourseIds.push(course.id);
          }
        }

        // Fetch module-level details for multi-module courses that need attention
        if (relevantCourseIds.length > 0) {
          const { data: modules } = await supabase
            .from("course_modules")
            .select("id, course_id, title, status, progress, processing_state, last_error, retry_count, module_number")
            .in("course_id", relevantCourseIds)
            .order("module_number", { ascending: true });

          if (modules && modules.length > 0) {
            // Group modules by course
            const modulesByCourse: Record<string, ModuleInfo[]> = {};
            for (const mod of modules) {
              if (!modulesByCourse[mod.course_id]) {
                modulesByCourse[mod.course_id] = [];
              }
              modulesByCourse[mod.course_id].push(mod as ModuleInfo);
            }

            // Build module breakdown
            const breakdownLines: string[] = [];
            for (const courseId of Object.keys(modulesByCourse)) {
              const courseMods = modulesByCourse[courseId];
              const course = courses.find(c => c.id === courseId);
              if (!course || !course.is_multi_module) continue;

              breakdownLines.push(`\nMODULES FOR "${course.title}":`);

              const completed = courseMods.filter(m => m.status === "completed");
              const failed = courseMods.filter(m => m.status === "failed" || m.last_error);
              const processing = courseMods.filter(m => !["completed", "failed"].includes(m.status) && !m.last_error);
              const queued = courseMods.filter(m => m.status === "queued");

              for (const mod of courseMods) {
                const statusEmoji = mod.status === "completed" ? "✅" :
                  mod.status === "failed" || mod.last_error ? "❌" :
                    mod.status === "queued" ? "⏳" : "🔄";

                let statusText = `${statusEmoji} ${mod.title}: ${mod.status} at ${mod.progress}%`;

                if (mod.processing_state && mod.processing_state !== "pending") {
                  statusText += ` (${mod.processing_state})`;
                }

                if (mod.last_error) {
                  // Simplify error for context
                  const simpleError = mod.last_error.includes("timeout") ? "timed out" :
                    mod.last_error.includes("stuck") ? "got stuck" :
                      mod.last_error.includes("memory") ? "memory issue" :
                        mod.last_error.includes("format") ? "format issue" :
                          "hit an error";
                  statusText += ` - ${simpleError}`;
                }

                statusText += ` (module ref: ${mod.id})`;
                breakdownLines.push(`  ${statusText}`);
              }

              breakdownLines.push(`  Summary: ${completed.length} done, ${processing.length} in progress, ${queued.length} waiting, ${failed.length} need help`);
            }

            if (breakdownLines.length > 0) {
              moduleBreakdown = breakdownLines.join("\n");
            }
          }

          // Fetch recent error logs for detailed context
          const { data: errorLogs } = await supabase
            .from("error_logs")
            .select("course_id, module_id, step, error_type, error_message, fix_strategy, fix_attempted, fix_succeeded, created_at")
            .in("course_id", relevantCourseIds)
            .order("created_at", { ascending: false })
            .limit(10);

          if (errorLogs && errorLogs.length > 0) {
            const errorLines: string[] = ["\nRECENT ERROR DETAILS:"];
            for (const err of errorLogs.slice(0, 5)) {
              const course = courses.find(c => c.id === err.course_id);
              const stepName = err.step.replace(/_/g, " ");

              // Translate technical errors to user-friendly language
              let userFriendlyError = err.error_message;
              if (err.error_message.includes("stuck")) {
                userFriendlyError = "Processing took too long and got stuck";
              } else if (err.error_message.includes("timeout")) {
                userFriendlyError = "Video processing timed out (usually works on retry)";
              } else if (err.error_message.includes("memory")) {
                userFriendlyError = "Video was too large to process in one go";
              } else if (err.error_message.includes("format")) {
                userFriendlyError = "Video format had issues";
              }

              const fixInfo = err.fix_attempted
                ? (err.fix_succeeded ? " - auto-fix worked!" : " - auto-fix tried but needs manual retry")
                : " - can retry";

              errorLines.push(`  - "${course?.title || 'Unknown'}": ${stepName} - ${userFriendlyError}${fixInfo}`);
            }
            errorDetails = errorLines.join("\n");
          }
        }

        courseContext = `
CURRENT USER SITUATION:
- Total courses: ${courses.length}
- Actively processing: ${processingCourses.length}
- Stalled (no activity 2+ min): ${stalledCourses.length}
- Failed: ${failedCourses.length}

${stalledCourses.length > 0 ? `STALLED COURSES (need attention):
${stalledCourses.map(c => `- "${c.title}" at ${c.progress}%${c.is_multi_module ? ` (${c.module_count} modules)` : ""} (course ref: ${c.id}) - no activity for ${Math.floor((now - new Date(c.last_heartbeat_at || c.updated_at).getTime()) / 60000)} minutes`).join("\n")}` : ""}

${processingCourses.length > 0 ? `ACTIVELY PROCESSING:
${processingCourses.map(c => `- "${c.title}" at ${c.progress}%${c.is_multi_module ? ` (${c.module_count} modules)` : ""} (course ref: ${c.id})`).join("\n")}` : ""}

${failedCourses.length > 0 ? `FAILED COURSES:
${failedCourses.map(c => `- "${c.title}" at ${c.progress}%${c.is_multi_module ? ` (${c.module_count} modules)` : ""} (course ref: ${c.id}): ${c.error_message || "Unknown error"}`).join("\n")}` : ""}

${moduleBreakdown}

${errorDetails}
`;
      } else {
        courseContext = "User has no courses yet.";
      }
    }

    const systemPrompt = `You are Nedu, the friendly assistant for ONEDUO — an execution intelligence system.

OneDuo transforms unstructured content (videos, audio, transcripts, trainings) into structured, actionable systems that can be immediately implemented. Your job is to help users get their content processed so they can BUILD.

CRITICAL LENGTH RULE:
- Every response MUST be 140 characters or LESS (like a tweet)
- Be punchy, warm, clear
- Use buttons to continue conversations

PERSONALITY:
- Friendly, casual, helpful
- NEVER technical — no "heartbeat", "backend", "API", "database"
- Reassure users their progress is safe
- Remind them: we convert learning into EXECUTABLE systems

TROUBLESHOOTING KNOWLEDGE:
- "Stuck at 31%" = frame extraction in progress, normal for longer videos (5+ min)
- "Stuck at 17-25%" = transcription phase, can take a while for long audio
- "Timeout at frame extraction" = video was long, retry usually works
- "Memory issue" = video very large, might need smaller file
- "Format issue" = try re-exporting video from source
- If module says "completed" = that specific chapter is DONE
- If module says "failed" = only THAT chapter needs retry, others are fine
- For multi-module: check each module status, some may finish while others fail

WHEN USER ASKS "DID IT WORK?" or "DID ANY GO THROUGH?":
- Check the module breakdown - look for ✅ completed ones
- Tell them specifically which chapters finished vs which failed
- Be specific! Don't say "still processing" if some are done

STEP TRACKING:
When guiding users through a multi-step process, include step info:
[STEP:current:total]

Example flows:
- Fixing a stalled video: 3 steps (check status → fix → verify)
- Troubleshooting: 2-4 steps depending on issue
- Re-uploading: 2 steps (go upload → confirm done)

BUTTON FORMAT:
[ACTION:type:param:Label:description]

Available buttons:
[ACTION:tell_more:topic:Tell me more:Get more details]
[ACTION:confirm_done::Ok, done:I finished this step]
[ACTION:fix_stall:courseId:Fix this:Restart stalled video]
[ACTION:retry_course:courseId:Try again:Restart entire course]
[ACTION:retry_module:moduleId:Retry this chapter:Restart just this module]
[ACTION:contact_support::Talk to Mikhaela:Get human help]

CONVERSATION FLOW:
1. Short answer (≤140 chars)
2. If multi-step: include [STEP:1:3] etc.
3. If user needs to do something: end with "Click Ok when done" + Ok button
4. After they click Ok: guide to next step with updated [STEP:2:3]

CRITICAL:
- courseId = the UUID from "course ref: ..." in the list (NOT the title)
- moduleId = the UUID from "module ref: ..." in the list (NOT the title)
- Keep responses SHORT. 140 chars max. Buttons handle the rest.
- When user asks about specific chapters - look at MODULE BREAKDOWN section!
- Be specific about which chapters completed vs failed

${courseContext}
`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: "user", content: message },
    ];

    console.log("[nedu-chat] Processing message for:", email);
    console.log("[nedu-chat] Course context:", courseContext);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "I'm a bit busy right now. Give me a moment and try again!",
            actions: []
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "I need a quick coffee break. Please try again in a moment!",
            actions: []
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("[nedu-chat] AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const aiResponse = await response.json();
    let content = aiResponse.choices?.[0]?.message?.content || "Hmm, I'm having trouble thinking right now. Try asking again!";

    // Parse action buttons from response
    const actionRegex = /\[ACTION:(\w+):([^:]*):([^:]+):([^\]]+)\]/g;
    const actions: NeduAction[] = [];
    let match;

    while ((match = actionRegex.exec(content)) !== null) {
      const actionType = match[1] as NeduAction["actionType"];
      actions.push({
        id: crypto.randomUUID(),
        actionType,
        courseId: ["fix_stall", "retry_course"].includes(actionType) ? (match[2] || undefined) : undefined,
        moduleId: actionType === "retry_module" ? (match[2] || undefined) : undefined,
        topic: actionType === "tell_more" ? match[2] : undefined,
        label: match[3],
        description: match[4],
      });
    }

    // Parse step progress
    const stepRegex = /\[STEP:(\d+):(\d+)\]/;
    const stepMatch = stepRegex.exec(content);
    const stepProgress = stepMatch ? {
      current: parseInt(stepMatch[1], 10),
      total: parseInt(stepMatch[2], 10),
    } : null;

    // Remove action and step markers from displayed content
    const cleanContent = content
      .replace(actionRegex, "")
      .replace(stepRegex, "")
      .trim();

    console.log("[nedu-chat] Response generated with", actions.length, "actions, step:", stepProgress);

    return new Response(
      JSON.stringify({
        message: cleanContent,
        actions,
        stepProgress,
        stalledCount: stalledCourses.length,
        processingCount: processingCourses.length,
        failedCount: failedCourses.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[nedu-chat] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Something went wrong",
        message: "Oops! I hit a small snag. Let me try again - just send your message once more.",
        actions: []
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
