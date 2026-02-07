import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  checkSystemHealth,
  createJobContext,
  logJobEvent,
  verifyCourseOutputs,
  detectAndRecoverMissingData,
  STEP_SLA_SECONDS,
} from "../_shared/reliability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Pipeline Health Monitor
 * 
 * Provides comprehensive health checks and recovery capabilities:
 * - System health overview
 * - Job integrity verification
 * - Automatic backfill for missing data
 * - SLA breach detection
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "health";

    console.log(`[pipeline-health] Action: ${action}`);

    switch (action) {
      // ============ SYSTEM HEALTH CHECK ============
      case "health": {
        const health = await checkSystemHealth(supabase);
        
        // Additional pipeline-specific checks
        const now = Date.now();
        
        // Check for courses stuck in intermediate states
        const { data: stuckCourses } = await supabase
          .from("courses")
          .select("id, status, progress_step, last_heartbeat_at")
          .in("status", ["processing", "queued"])
          .lt("last_heartbeat_at", new Date(now - 15 * 60 * 1000).toISOString())
          .eq("purged", false)
          .limit(10);

        if (stuckCourses && stuckCourses.length > 0) {
          health.issues.push({
            severity: "warn",
            message: `${stuckCourses.length} courses with stale heartbeat (>15 min)`,
          });
        }

        // Check SLA breaches
        const { data: slaBreaches } = await supabase
          .from("processing_queue")
          .select("id, step, started_at, course_id")
          .eq("status", "processing")
          .eq("purged", false);

        let breachCount = 0;
        if (slaBreaches) {
          for (const job of slaBreaches) {
            const sla = STEP_SLA_SECONDS[job.step] || STEP_SLA_SECONDS.default;
            const elapsed = (now - new Date(job.started_at).getTime()) / 1000;
            if (elapsed > sla * 2) {
              breachCount++;
            }
          }
        }

        if (breachCount > 0) {
          health.issues.push({
            severity: "critical",
            message: `${breachCount} jobs exceeding SLA by 2x`,
          });
          health.healthy = false;
        }

        return new Response(JSON.stringify({
          healthy: health.healthy,
          timestamp: new Date().toISOString(),
          issues: health.issues,
          summary: {
            stuckCourses: stuckCourses?.length || 0,
            slaBreaches: breachCount,
            totalIssues: health.issues.length,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ VERIFY COURSE OUTPUTS ============
      case "verify-course": {
        const { courseId } = body;
        if (!courseId) {
          return new Response(JSON.stringify({ error: "courseId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const verification = await verifyCourseOutputs(supabase, courseId);
        const ctx = createJobContext(courseId, "verify");

        await logJobEvent(supabase, ctx, {
          step: "output_verification",
          level: verification.verified ? "info" : "warn",
          message: verification.verified 
            ? "All critical outputs verified"
            : `Verification failed: ${verification.failedCritical.join(", ")}`,
          metadata: { checks: verification.checks },
        });

        return new Response(JSON.stringify(verification), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ RECOVER MISSING DATA ============
      case "recover": {
        const { courseId } = body;
        if (!courseId) {
          return new Response(JSON.stringify({ error: "courseId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ctx = createJobContext(courseId, "recovery");
        
        await logJobEvent(supabase, ctx, {
          step: "recovery_started",
          level: "info",
          message: "Starting data recovery for course",
        });

        const result = await detectAndRecoverMissingData(supabase, courseId);

        await logJobEvent(supabase, ctx, {
          step: "recovery_complete",
          level: result.framesRecovered || result.transcriptRecovered ? "info" : "warn",
          message: `Recovery complete: frames=${result.framesRecovered}, transcript=${result.transcriptRecovered}`,
          metadata: { actions: result.actions },
        });

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ BATCH INTEGRITY CHECK ============
      case "batch-verify": {
        const { limit = 10 } = body;

        // Find completed courses without verification
        const { data: courses } = await supabase
          .from("courses")
          .select("id, title, completed_at")
          .eq("status", "completed")
          .eq("purged", false)
          .order("completed_at", { ascending: false })
          .limit(limit);

        const results: Array<{
          courseId: string;
          title: string;
          verified: boolean;
          issues: string[];
        }> = [];

        for (const course of courses || []) {
          const verification = await verifyCourseOutputs(supabase, course.id);
          results.push({
            courseId: course.id,
            title: course.title,
            verified: verification.verified,
            issues: verification.failedCritical,
          });
        }

        const failedCount = results.filter(r => !r.verified).length;

        return new Response(JSON.stringify({
          checked: results.length,
          passed: results.length - failedCount,
          failed: failedCount,
          results,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ DETECT ORPHANED JOBS ============
      case "orphan-check": {
        // Find queue jobs with no corresponding course
        const { data: orphanedJobs } = await supabase
          .from("processing_queue")
          .select(`
            id, 
            course_id, 
            step, 
            status,
            courses!inner(id)
          `)
          .is("courses", null)
          .eq("purged", false)
          .in("status", ["pending", "processing"])
          .limit(50);

        // Find courses with no queue jobs but not completed
        const { data: strandedCourses } = await supabase.rpc(
          "detect_stuck_intermediate_states"
        );

        return new Response(JSON.stringify({
          orphanedJobs: orphanedJobs?.length || 0,
          strandedCourses: strandedCourses?.length || 0,
          details: {
            orphanedJobIds: orphanedJobs?.map(j => j.id) || [],
            strandedCourseIds: strandedCourses?.map((c: { course_id: string }) => c.course_id) || [],
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ JOB AUDIT TRAIL ============
      case "audit": {
        const { courseId, jobId, limit = 100 } = body;

        let query = supabase
          .from("job_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (jobId) {
          query = query.eq("job_id", jobId);
        } else if (courseId) {
          query = query.ilike("job_id", `%${courseId.slice(0, 8)}%`);
        }

        const { data: logs, error } = await query;

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Group by job_id for easier reading
        const groupedLogs: Record<string, typeof logs> = {};
        for (const log of logs || []) {
          if (!groupedLogs[log.job_id]) {
            groupedLogs[log.job_id] = [];
          }
          groupedLogs[log.job_id].push(log);
        }

        return new Response(JSON.stringify({
          totalLogs: logs?.length || 0,
          jobCount: Object.keys(groupedLogs).length,
          logs: groupedLogs,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ 
          error: "Unknown action",
          availableActions: [
            "health", 
            "verify-course", 
            "recover", 
            "batch-verify", 
            "orphan-check",
            "audit"
          ],
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("[pipeline-health] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
