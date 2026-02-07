import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

// Admin emails authorized to access ops-digest
const ADMIN_EMAILS = ["christinaxcabral@gmail.com"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Security: Require authentication
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedCronSecret = req.headers.get('x-cron-secret');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Allow cron job with secret OR authenticated admin user
  let isAuthorized = false;
  
  if (cronSecret && providedCronSecret === cronSecret) {
    // Cron job path - verified by secret
    isAuthorized = true;
    console.log("[ops-digest] Authorized via cron secret");
  } else if (authHeader) {
    // User path - verify JWT and admin email
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (!error && user?.email && ADMIN_EMAILS.includes(user.email)) {
      isAuthorized = true;
      console.log("[ops-digest] Authorized via admin user:", user.email);
    }
  }
  
  if (!isAuthorized) {
    console.warn("[ops-digest] Unauthorized access attempt");
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resend = new Resend(resendApiKey);

  try {
    const { test } = await req.json().catch(() => ({ test: false }));
    
    console.log("[ops-digest] Generating daily digest...");

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get auto-fixes from last 24 hours
    const { data: autoFixes } = await supabase
      .from("ops_auto_fixes")
      .select("*")
      .gte("detected_at", oneDayAgo)
      .order("detected_at", { ascending: false });

    // Get top patterns
    const { data: patterns } = await supabase
      .from("ops_patterns")
      .select("*")
      .order("occurrence_count", { ascending: false })
      .limit(5);

    // Get course stats
    const { data: completedToday } = await supabase
      .from("courses")
      .select("id")
      .gte("completed_at", oneDayAgo)
      .eq("status", "completed");

    const { data: failedToday } = await supabase
      .from("courses")
      .select("id")
      .gte("updated_at", oneDayAgo)
      .eq("status", "failed");

    const { data: processingNow } = await supabase
      .from("courses")
      .select("id")
      .in("status", ["queued", "processing", "transcribing", "extracting"]);

    // Count by severity
    const highSeverity = autoFixes?.filter(f => f.severity === "high").length || 0;
    const mediumSeverity = autoFixes?.filter(f => f.severity === "medium").length || 0;
    const lowSeverity = autoFixes?.filter(f => f.severity === "low").length || 0;
    const totalAutoFixed = autoFixes?.filter(f => f.auto_fixed).length || 0;

    // Generate email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030303;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #0a0f14; border: 1px solid rgba(255,255,255,0.1);">
    
    <!-- Header -->
    <div style="padding: 32px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <h1 style="margin: 0; color: #22d3ee; font-size: 24px; font-weight: 700;">
        🤖 OneDuo Ops Digest
      </h1>
      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.5); font-size: 14px;">
        ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>

    <!-- Summary Stats -->
    <div style="padding: 24px 32px; background: linear-gradient(135deg, rgba(34,211,238,0.05), rgba(168,85,247,0.05));">
      <h2 style="margin: 0 0 16px 0; color: white; font-size: 16px; font-weight: 600;">
        📊 24-Hour Summary
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px; background: rgba(34,211,238,0.1); border-radius: 8px 0 0 0; text-align: center;">
            <div style="color: #22d3ee; font-size: 28px; font-weight: 700;">${totalAutoFixed}</div>
            <div style="color: rgba(255,255,255,0.6); font-size: 12px;">Auto-Fixed</div>
          </td>
          <td style="padding: 12px; background: rgba(34,197,94,0.1); text-align: center;">
            <div style="color: #22c55e; font-size: 28px; font-weight: 700;">${completedToday?.length || 0}</div>
            <div style="color: rgba(255,255,255,0.6); font-size: 12px;">Completed</div>
          </td>
          <td style="padding: 12px; background: rgba(239,68,68,0.1); border-radius: 0 8px 0 0; text-align: center;">
            <div style="color: #ef4444; font-size: 28px; font-weight: 700;">${failedToday?.length || 0}</div>
            <div style="color: rgba(255,255,255,0.6); font-size: 12px;">Failed</div>
          </td>
        </tr>
        <tr>
          <td colspan="3" style="padding: 12px; background: rgba(234,179,8,0.1); border-radius: 0 0 8px 8px; text-align: center;">
            <div style="color: #eab308; font-size: 20px; font-weight: 700;">${processingNow?.length || 0} currently processing</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Auto-Fixes by Severity -->
    ${autoFixes?.length ? `
    <div style="padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.1);">
      <h2 style="margin: 0 0 16px 0; color: white; font-size: 16px; font-weight: 600;">
        🔧 Auto-Fixes by Severity
      </h2>
      <div style="display: flex; gap: 8px;">
        ${highSeverity > 0 ? `<span style="padding: 6px 12px; background: rgba(239,68,68,0.2); color: #ef4444; border-radius: 16px; font-size: 13px; font-weight: 500;">🔴 ${highSeverity} High</span>` : ''}
        ${mediumSeverity > 0 ? `<span style="padding: 6px 12px; background: rgba(234,179,8,0.2); color: #eab308; border-radius: 16px; font-size: 13px; font-weight: 500;">🟡 ${mediumSeverity} Medium</span>` : ''}
        ${lowSeverity > 0 ? `<span style="padding: 6px 12px; background: rgba(34,197,94,0.2); color: #22c55e; border-radius: 16px; font-size: 13px; font-weight: 500;">🟢 ${lowSeverity} Low</span>` : ''}
      </div>
      
      <!-- Recent Fixes List -->
      <div style="margin-top: 16px;">
        ${autoFixes.slice(0, 5).map(fix => `
          <div style="padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid ${fix.severity === 'high' ? '#ef4444' : fix.severity === 'medium' ? '#eab308' : '#22c55e'};">
            <div style="color: white; font-size: 13px; font-weight: 500;">${fix.issue_type}</div>
            <div style="color: rgba(255,255,255,0.5); font-size: 12px; margin-top: 4px;">${fix.issue_description.slice(0, 100)}${fix.issue_description.length > 100 ? '...' : ''}</div>
            ${fix.fix_applied ? `<div style="color: #22d3ee; font-size: 11px; margin-top: 4px;">→ ${fix.fix_applied}</div>` : ''}
          </div>
        `).join('')}
        ${autoFixes.length > 5 ? `<p style="color: rgba(255,255,255,0.4); font-size: 12px; text-align: center;">+ ${autoFixes.length - 5} more fixes</p>` : ''}
      </div>
    </div>
    ` : `
    <div style="padding: 24px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
      <p style="color: rgba(255,255,255,0.5); margin: 0;">✨ No auto-fixes needed in the last 24 hours!</p>
    </div>
    `}

    <!-- Top Patterns -->
    ${patterns?.length ? `
    <div style="padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.1);">
      <h2 style="margin: 0 0 16px 0; color: white; font-size: 16px; font-weight: 600;">
        📈 Top Patterns Detected
      </h2>
      ${patterns.map((pattern, i) => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; ${i < patterns.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.05);' : ''}">
          <div style="min-width: 40px; height: 40px; background: rgba(168,85,247,0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #a855f7; font-weight: 700; font-size: 14px;">
            ${pattern.occurrence_count}x
          </div>
          <div style="flex: 1;">
            <div style="color: white; font-size: 13px; font-weight: 500;">${pattern.pattern_key}</div>
            <div style="color: rgba(255,255,255,0.4); font-size: 11px;">${pattern.pattern_description.slice(0, 60)}${pattern.pattern_description.length > 60 ? '...' : ''}</div>
          </div>
          ${pattern.auto_fix_available ? `<span style="padding: 4px 8px; background: rgba(34,197,94,0.2); color: #22c55e; border-radius: 12px; font-size: 10px;">Auto-fixable</span>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Status Banner -->
    <div style="padding: 20px 32px; background: linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,211,238,0.1)); border-top: 1px solid rgba(255,255,255,0.1);">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 12px; height: 12px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 12px rgba(34,197,94,0.5);"></div>
        <span style="color: white; font-size: 14px; font-weight: 500;">Self-Healing System Active</span>
      </div>
      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.5); font-size: 12px;">
        Watchdog runs every 5 minutes • Auto-fixes applied silently • You're sipping piña coladas 🍹
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 24px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
      <a href="https://oneduo.ai/admin/ops" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #22d3ee, #a855f7); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
        View Ops Dashboard →
      </a>
      <p style="margin: 16px 0 0 0; color: rgba(255,255,255,0.3); font-size: 11px;">
        OneDuo • Autonomous Operations
      </p>
    </div>

  </div>
</body>
</html>
    `;

    // Send email
    const adminEmail = "christinaxcabral@gmail.com";
    
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: "OneDuo Ops <hello@oneduo.ai>",
      to: [adminEmail],
      subject: `🤖 OneDuo Ops: ${totalAutoFixed} auto-fixes, ${completedToday?.length || 0} completed, ${failedToday?.length || 0} failed`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("[ops-digest] Email error:", emailError);
      throw emailError;
    }

    console.log("[ops-digest] Digest sent successfully:", emailResult);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Daily digest sent",
      stats: {
        autoFixes: autoFixes?.length || 0,
        totalAutoFixed,
        highSeverity,
        mediumSeverity,
        lowSeverity,
        completedToday: completedToday?.length || 0,
        failedToday: failedToday?.length || 0,
        processingNow: processingNow?.length || 0,
        patterns: patterns?.length || 0,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[ops-digest] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
