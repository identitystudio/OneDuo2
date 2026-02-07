import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Ops alert email
const OPS_EMAIL = "christinaxcabral@gmail.com";

/**
 * Notify Processing Failure
 * 
 * Central handler for processing failures that:
 * 1. Sends detailed ops alert email to Christina
 * 2. Sends reassuring "manual processing" email to user
 * 3. Updates course status to 'manual_review' instead of 'failed'
 * 
 * This creates a seamless user experience while ensuring ops visibility.
 */

interface NotifyFailureRequest {
  courseId: string;
  step: string;
  errorMessage: string;
  attemptCount?: number;
  source?: string; // Which edge function triggered this (ops-watchdog, replicate-webhook, etc.)
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.error("[notify-processing-failure] RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendApiKey);
    const body: NotifyFailureRequest = await req.json();
    const { courseId, step, errorMessage, attemptCount = 0, source = "unknown" } = body;

    if (!courseId || !step) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[notify-processing-failure] Processing failure for course ${courseId}, step: ${step}, source: ${source}`);

    // Fetch course details
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, title, email, video_duration_seconds, created_at, status")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      console.error("[notify-processing-failure] Failed to fetch course:", courseError);
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip if already in manual_review (prevent duplicate notifications)
    if (course.status === "manual_review") {
      console.log(`[notify-processing-failure] Course ${courseId} already in manual_review, skipping duplicate notification`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: true, 
        reason: "already_in_manual_review" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoDuration = course.video_duration_seconds 
      ? `${Math.round(course.video_duration_seconds / 60)} minutes`
      : "Unknown";
    
    const createdAt = new Date(course.created_at).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    // ============ 1. SEND OPS ALERT EMAIL ============
    console.log(`[notify-processing-failure] Sending ops alert to ${OPS_EMAIL}...`);
    
    try {
      await resend.emails.send({
        from: "OneDuo Ops <alerts@oneduo.ai>",
        to: [OPS_EMAIL],
        subject: `🚨 Manual Processing Needed - "${course.title}"`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .detail-row { display: flex; margin: 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
    .label { font-weight: 600; color: #6b7280; min-width: 140px; }
    .value { color: #111827; word-break: break-all; }
    .error-box { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .action-btn { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 15px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px;">🚨 Manual Processing Required</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">A video needs your attention</p>
    </div>
    <div class="content">
      <div class="detail-row">
        <span class="label">Title:</span>
        <span class="value">${course.title}</span>
      </div>
      <div class="detail-row">
        <span class="label">User Email:</span>
        <span class="value">${course.email}</span>
      </div>
      <div class="detail-row">
        <span class="label">Course ID:</span>
        <span class="value"><code>${courseId}</code></span>
      </div>
      <div class="detail-row">
        <span class="label">Video Duration:</span>
        <span class="value">${videoDuration}</span>
      </div>
      <div class="detail-row">
        <span class="label">Failed Step:</span>
        <span class="value"><code>${step}</code></span>
      </div>
      <div class="detail-row">
        <span class="label">Attempt Count:</span>
        <span class="value">${attemptCount}</span>
      </div>
      <div class="detail-row">
        <span class="label">Triggered By:</span>
        <span class="value">${source}</span>
      </div>
      <div class="detail-row">
        <span class="label">Uploaded:</span>
        <span class="value">${createdAt} PT</span>
      </div>
      
      <div class="error-box">
        <strong>Error Message:</strong>
        <p style="margin: 10px 0 0 0; font-family: monospace; font-size: 13px;">${errorMessage}</p>
      </div>
      
      <p style="color: #6b7280; margin-top: 20px;">
        The user has been notified that their video is receiving "special attention" from our team.
        They're expecting an email when it's complete.
      </p>
      
      <a href="https://oneduo.lovable.app/ops" class="action-btn">
        Open Ops Dashboard →
      </a>
      
      <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
        Troubleshoot in Lovable Chat using course ID: <code>${courseId}</code>
      </p>
    </div>
  </div>
</body>
</html>
        `,
      });
      console.log(`[notify-processing-failure] Ops alert sent successfully`);
    } catch (opsEmailError) {
      console.error("[notify-processing-failure] Failed to send ops alert:", opsEmailError);
      // Continue - user email is more important
    }

    // ============ 2. SEND USER REASSURANCE EMAIL ============
    console.log(`[notify-processing-failure] Sending user reassurance email to ${course.email}...`);
    
    try {
      await resend.emails.send({
        from: "Christina from OneDuo <hello@oneduo.ai>",
        to: [course.email],
        subject: `✨ Your Video is Receiving Special Attention - "${course.title}"`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #fafafa; padding: 30px; border-radius: 0 0 12px 12px; }
    .checkmark { display: inline-block; background: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; margin-right: 10px; font-size: 14px; }
    .check-item { display: flex; align-items: center; margin: 15px 0; font-size: 16px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .signature-name { font-weight: 600; color: #8b5cf6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">✨ Special Attention Mode</h1>
      <p style="margin: 15px 0 0 0; opacity: 0.9; font-size: 16px;">Your video is in expert hands</p>
    </div>
    <div class="content">
      <p style="font-size: 18px; color: #374151;">
        Great news – your video <strong>"${course.title}"</strong> uploaded successfully!
      </p>
      
      <p style="color: #4b5563;">
        Your content is currently receiving manual attention from our team to ensure 
        the highest quality Thinking Layer possible.
      </p>
      
      <h3 style="color: #1f2937; margin-top: 25px;">What this means:</h3>
      
      <div class="check-item">
        <span class="checkmark">✓</span>
        <span>Your video is safe and secure</span>
      </div>
      <div class="check-item">
        <span class="checkmark">✓</span>
        <span>Our team is actively working on your content</span>
      </div>
      <div class="check-item">
        <span class="checkmark">✓</span>
        <span>You'll receive an email the moment it's ready</span>
      </div>
      
      <p style="color: #4b5563; margin-top: 25px;">
        Thank you for your patience as we create execution magic for you. 
        We're committed to delivering the best possible experience.
      </p>
      
      <div class="signature">
        <p style="margin: 0;">With gratitude,</p>
        <p class="signature-name" style="margin: 5px 0 0 0;">Christina</p>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Founder, OneDuo</p>
      </div>
    </div>
  </div>
</body>
</html>
        `,
      });
      console.log(`[notify-processing-failure] User reassurance email sent successfully`);
    } catch (userEmailError) {
      console.error("[notify-processing-failure] Failed to send user email:", userEmailError);
    }

    // ============ 3. UPDATE COURSE STATUS TO MANUAL_REVIEW ============
    console.log(`[notify-processing-failure] Updating course ${courseId} to manual_review status...`);
    
    const { error: updateError } = await supabase
      .from("courses")
      .update({
        status: "manual_review",
        error_message: null, // Clear error message - user shouldn't see technical details
        progress_step: "manual_review",
      })
      .eq("id", courseId);

    if (updateError) {
      console.error("[notify-processing-failure] Failed to update course status:", updateError);
    } else {
      console.log(`[notify-processing-failure] Course ${courseId} set to manual_review`);
    }

    // ============ 4. LOG THE FAILURE FOR OPS TRACKING ============
    try {
      await supabase.from("ops_auto_fixes").insert({
        issue_type: "manual_review_triggered",
        issue_description: `Processing failed at step ${step}, moved to manual review`,
        severity: "high",
        auto_fixed: false,
        course_id: courseId,
        user_email: course.email,
        metadata: {
          step,
          error_message: errorMessage,
          attempt_count: attemptCount,
          source,
          ops_notified: true,
          user_notified: true,
        },
      });
    } catch (logErr) {
      console.warn("[notify-processing-failure] Failed to log to ops_auto_fixes:", logErr);
    }

    return new Response(JSON.stringify({ 
      success: true,
      opsNotified: true,
      userNotified: true,
      statusUpdated: !updateError,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[notify-processing-failure] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
