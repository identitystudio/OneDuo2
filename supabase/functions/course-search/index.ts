import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, courseId, query, stepNumber, completed, notes } = await req.json();

    console.log(`[course-search] Action: ${action}, Course: ${courseId}`);

    switch (action) {
      // ============ SEARCH CHAT HISTORY ============
      case "search": {
        if (!courseId || !query) {
          return new Response(JSON.stringify({ error: "Missing courseId or query" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Input validation: limit query length to prevent DoS
        if (typeof query !== 'string' || query.length > 200) {
          return new Response(JSON.stringify({ error: "Invalid query: must be a string under 200 characters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Sanitize query to escape ILIKE special characters and prevent pattern injection
        const sanitizeILikeQuery = (q: string): string => {
          return q.replace(/[%_\\]/g, '\\$&');
        };
        const sanitizedQuery = sanitizeILikeQuery(query.trim());

        // Search chat messages using ILIKE for text matching with sanitized input
        const { data: messages, error } = await supabase
          .from("course_chats")
          .select("id, role, content, created_at, frame_references")
          .eq("course_id", courseId)
          .ilike("content", `%${sanitizedQuery}%`)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) throw error;

        return new Response(JSON.stringify({ results: messages || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ GET COURSE WITH MODULES & PROGRESS ============
      case "get-course-details": {
        if (!courseId) {
          return new Response(JSON.stringify({ error: "Missing courseId" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("id, title, status, video_duration_seconds, total_frames, modules, transcript")
          .eq("id", courseId)
          .single();

        if (courseError) throw courseError;

        const { data: progress, error: progressError } = await supabase
          .from("course_progress")
          .select("*")
          .eq("course_id", courseId)
          .order("step_number", { ascending: true });

        if (progressError) throw progressError;

        return new Response(JSON.stringify({ course, progress: progress || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ UPDATE PROGRESS ============
      case "update-progress": {
        if (!courseId || stepNumber === undefined) {
          return new Response(JSON.stringify({ error: "Missing courseId or stepNumber" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (completed !== undefined) {
          updateData.completed = completed;
          updateData.completed_at = completed ? new Date().toISOString() : null;
        }
        if (notes !== undefined) {
          updateData.notes = notes;
        }

        const { data, error } = await supabase
          .from("course_progress")
          .update(updateData)
          .eq("course_id", courseId)
          .eq("step_number", stepNumber)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ success: true, progress: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ GENERATE MODULES FROM TRANSCRIPT ============
      case "generate-modules": {
        if (!courseId) {
          return new Response(JSON.stringify({ error: "Missing courseId" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("transcript, video_duration_seconds, modules")
          .eq("id", courseId)
          .single();

        if (courseError) throw courseError;

        // If modules already exist, return them
        if (course.modules && course.modules.length > 0) {
          return new Response(JSON.stringify({ modules: course.modules }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Auto-detect modules from transcript
        const transcript = course.transcript || [];
        const duration = course.video_duration_seconds || 3600;
        
        // Create modules by splitting transcript into ~5-10 minute chunks
        const moduleLength = Math.min(600, duration / 5); // 10 minutes or course/5
        const modules = [];
        let currentModule: any = null;
        let moduleIndex = 0;

        for (const segment of transcript) {
          const segmentStart = segment.start;
          
          if (!currentModule || segmentStart >= (moduleIndex + 1) * moduleLength) {
            if (currentModule) {
              currentModule.endTime = segment.start;
              modules.push(currentModule);
            }
            
            moduleIndex = Math.floor(segmentStart / moduleLength);
            const firstWords = segment.text.split(' ').slice(0, 8).join(' ');
            
            currentModule = {
              index: modules.length,
              title: `Section ${modules.length + 1}: ${firstWords}...`,
              startTime: segmentStart,
              endTime: null,
              keyTopics: [],
            };
          }

          // Extract potential key topics (sentences with action words)
          if (segment.text.match(/(click|select|choose|create|add|open|go to|navigate)/i)) {
            if (currentModule.keyTopics.length < 5) {
              currentModule.keyTopics.push({
                timestamp: segment.start,
                topic: segment.text.substring(0, 100),
              });
            }
          }
        }

        if (currentModule) {
          currentModule.endTime = duration;
          modules.push(currentModule);
        }

        // Save modules to course
        await supabase
          .from("courses")
          .update({ modules })
          .eq("id", courseId);

        // Generate progress steps from modules
        const progressSteps = modules.flatMap((module: any, mIdx: number) => {
          const steps = [{
            course_id: courseId,
            step_number: mIdx * 10 + 1,
            step_title: `Watch ${module.title}`,
            step_description: `Watch this section from ${formatTime(module.startTime)} to ${formatTime(module.endTime)}`,
            module_index: mIdx,
            completed: false,
          }];
          
          // Add action steps from key topics
          module.keyTopics?.forEach((topic: any, tIdx: number) => {
            steps.push({
              course_id: courseId,
              step_number: mIdx * 10 + tIdx + 2,
              step_title: topic.topic.substring(0, 60) + (topic.topic.length > 60 ? '...' : ''),
              step_description: `Action step from ${formatTime(topic.timestamp)}`,
              module_index: mIdx,
              completed: false,
            });
          });
          
          return steps;
        });

        // Insert progress steps
        if (progressSteps.length > 0) {
          await supabase.from("course_progress").upsert(progressSteps, {
            onConflict: 'course_id,step_number',
          });
        }

        return new Response(JSON.stringify({ modules, progressSteps: progressSteps.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: unknown) {
    console.error("[course-search] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
