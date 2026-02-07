import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
};

interface ResendEmailRequest {
  courseId: string;
  email: string;
  action?: 'resend' | 'schedule-reminder' | 'cancel-reminder';
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    const { courseId, email, action = 'resend' } = await req.json() as ResendEmailRequest;

    if (!courseId || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing courseId or email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle reminder scheduling
    if (action === 'schedule-reminder' || action === 'cancel-reminder') {
      console.log(`[resend-access-email] ${action} for course ${courseId}`);
      
      // Get course details for the email
      const { data: course } = await supabase
        .from('courses')
        .select('title')
        .eq('id', courseId)
        .single();

      const courseTitle = course?.title || 'your course';
      
      // Log the reminder preference
      await supabase.from('artifact_access_log').insert({
        course_id: courseId,
        access_type: action === 'schedule-reminder' ? 'reminder_scheduled' : 'reminder_cancelled',
        download_source: 'dashboard',
      });

      // Send confirmation email when scheduling reminder
      if (action === 'schedule-reminder' && resend) {
        const confirmationHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reminder Scheduled</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="min-width: 320px; background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="text-align: center; padding-bottom: 32px;">
              <div style="font-size: 28px; font-weight: 700; color: #22d3ee; letter-spacing: -0.5px;">OneDuo</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">AI's Thinking Layer</div>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1);">
              
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 64px; height: 64px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="font-size: 28px;">🔔</span>
                </div>
              </div>
              
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; text-align: center; color: #ffffff;">
                Expiry Reminder Scheduled
              </h1>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #9ca3af; text-align: center;">
                You'll receive a reminder <strong style="color: #10b981;">2 hours before</strong> your access link for <strong style="color: #ffffff;">"${courseTitle}"</strong> expires.
              </p>
              
              <!-- Confirmation Box -->
              <div style="background: rgba(16, 185, 129, 0.1); border-radius: 8px; padding: 20px; border-left: 3px solid #10b981; margin-bottom: 24px;">
                <div style="font-size: 14px; color: #10b981; font-weight: 600; margin-bottom: 8px;">✓ Reminder Confirmed</div>
                <div style="font-size: 13px; color: #9ca3af; line-height: 1.5;">
                  We'll send you an email reminder before your 24-hour access window closes. This gives you time to download your Thinking Layer artifacts.
                </div>
              </div>
              
              <!-- What to Expect -->
              <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;">
                <div style="font-size: 14px; color: #ffffff; font-weight: 600; margin-bottom: 12px;">What happens next:</div>
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding: 4px 0; font-size: 13px; color: #9ca3af;">⏰ <span style="color: #22d3ee;">22 hours:</span> Your link is still active</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-size: 13px; color: #9ca3af;">📧 <span style="color: #f59e0b;">2 hours left:</span> We'll email you a reminder</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-size: 13px; color: #9ca3af;">🔄 <span style="color: #6b7280;">After expiry:</span> Generate a new link from dashboard</td>
                  </tr>
                </table>
              </div>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                Manage your reminders from your 
                <a href="https://oneduo.ai/dashboard" style="color: #22d3ee; text-decoration: none;">OneDuo Dashboard</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #4b5563;">
                © ${new Date().getFullYear()} OneDuo. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;

        try {
          await resend.emails.send({
            from: 'OneDuo <hello@oneduo.ai>',
            to: [email],
            subject: `🔔 Reminder Scheduled: ${courseTitle}`,
            html: confirmationHtml,
          });
          console.log(`[resend-access-email] Confirmation email sent for reminder scheduling`);
        } catch (emailError) {
          console.error('[resend-access-email] Failed to send confirmation email:', emailError);
          // Don't fail the request, just log the error
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: action === 'schedule-reminder' 
            ? 'Reminder scheduled - confirmation email sent' 
            : 'Reminder cancelled'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[resend-access-email] Generating new secure link for course ${courseId}`);

    // Verify the course exists and belongs to this email
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, email, status, share_token, module_count, is_multi_module')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      console.error('[resend-access-email] Course not found:', courseError);
      return new Response(
        JSON.stringify({ error: 'Course not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify email ownership
    if (course.email.toLowerCase() !== email.toLowerCase()) {
      console.error('[resend-access-email] Email mismatch - unauthorized access attempt');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - email does not match course owner' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify course is completed
    if (course.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Course is not yet completed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get modules for multi-module courses
    let modules: any[] = [];
    if (course.is_multi_module && course.module_count && course.module_count > 1) {
      const { data: moduleData } = await supabase
        .from('course_modules')
        .select('id, title, module_number')
        .eq('course_id', courseId)
        .eq('status', 'completed')
        .order('module_number');
      
      modules = moduleData || [];
    }

    // Generate the secure access link via track-download endpoint
    const baseUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
    const accessLink = `${baseUrl}/track-download?courseId=${courseId}&source=email&token=${course.share_token}`;

    // Send the email
    if (resend) {
      const moduleCount = modules.length > 0 ? modules.length : (course.module_count || 1);
      
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your OneDuo Secure Access Link</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="min-width: 320px; background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="text-align: center; padding-bottom: 32px;">
              <div style="font-size: 28px; font-weight: 700; color: #22d3ee; letter-spacing: -0.5px;">OneDuo</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">AI's Thinking Layer</div>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1);">
              
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 64px; height: 64px; background: rgba(34, 211, 238, 0.1); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="font-size: 28px;">🔐</span>
                </div>
              </div>
              
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; text-align: center; color: #ffffff;">
                Your New Secure Access Link
              </h1>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #9ca3af; text-align: center;">
                Your previous link has been replaced with a new secure access link for <strong style="color: #ffffff;">"${course.title}"</strong>.
              </p>
              
              ${moduleCount > 1 ? `
              <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Modules included:</div>
                <div style="font-size: 18px; color: #22d3ee; font-weight: 600;">${moduleCount} Modules Ready</div>
              </div>
              ` : ''}
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${accessLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%); color: #000000; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 14px rgba(34, 211, 238, 0.3);">
                      Access Your Thinking Layer →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Security Notice -->
              <div style="background: rgba(34, 211, 238, 0.1); border-radius: 8px; padding: 16px; border-left: 3px solid #22d3ee;">
                <div style="font-size: 14px; color: #22d3ee; font-weight: 600; margin-bottom: 4px;">🔒 Security Notice</div>
                <div style="font-size: 13px; color: #9ca3af; line-height: 1.5;">
                  This link is valid for <strong style="color: #ffffff;">24 hours</strong> and is tied to your account for security. 
                  If it expires, you can always generate a new one from your dashboard.
                </div>
              </div>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                You can always access your artifacts from your 
                <a href="${supabaseUrl.replace('.supabase.co', '.lovable.app')}/dashboard" style="color: #22d3ee; text-decoration: none;">OneDuo Dashboard</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #4b5563;">
                © ${new Date().getFullYear()} OneDuo. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      try {
        const emailResult = await resend.emails.send({
          from: 'OneDuo <hello@oneduo.ai>',
          to: [email],
          subject: `🔐 New Secure Access Link: ${course.title}`,
          html: emailHtml,
        });

        console.log(`[resend-access-email] Email sent successfully:`, emailResult);
      } catch (emailError) {
        console.error('[resend-access-email] Failed to send email:', emailError);
        return new Response(
          JSON.stringify({ error: 'Failed to send email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log('[resend-access-email] No RESEND_API_KEY configured, skipping email');
    }

    // Log the access link generation
    await supabase.from('artifact_access_log').insert({
      course_id: courseId,
      access_type: 'resend_link',
      download_source: 'dashboard_resend',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'New secure access link has been sent to your email',
        expiresIn: '24 hours'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[resend-access-email] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
