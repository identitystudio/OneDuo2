/**
 * Send Status Notification - Proactive user communication for processing issues
 * 
 * Sends personalized emails to users about system status, errors being fixed,
 * or processing updates. Designed for beta user communication and peace of mind.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  emails?: string[];  // Specific emails to notify
  courseIds?: string[];  // Or notify by course IDs
  type: 'error_fix' | 'processing_update' | 'completion' | 'welcome';
  customMessage?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    const { emails, courseIds, type, customMessage } = await req.json() as NotificationRequest;

    // Gather recipients
    let recipients: { email: string; title: string; courseId: string; status: string }[] = [];

    if (courseIds && courseIds.length > 0) {
      const { data: courses } = await supabase
        .from('courses')
        .select('id, email, title, status')
        .in('id', courseIds);
      
      if (courses) {
        recipients = courses.map(c => ({
          email: c.email,
          title: c.title,
          courseId: c.id,
          status: c.status
        }));
      }
    } else if (emails && emails.length > 0) {
      // Get most recent course for each email
      for (const email of emails) {
        const { data: course } = await supabase
          .from('courses')
          .select('id, email, title, status')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (course) {
          recipients.push({
            email: course.email,
            title: course.title,
            courseId: course.id,
            status: course.status
          });
        }
      }
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipients found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { email: string; success: boolean; error?: string }[] = [];
    const dashboardUrl = 'https://oneduo.lovable.app/dashboard';

    for (const recipient of recipients) {
      let subject = '';
      let html = '';

      if (type === 'error_fix') {
        subject = `🔧 We Found & Fixed the Issue - "${recipient.title}"`;
        html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                <div style="width: 80px; height: 80px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                  <span style="font-size: 40px;">🔧</span>
                </div>
              </div>
              
              <h1 style="margin: 0 0 16px; font-size: 26px; font-weight: 700; text-align: center; color: #ffffff;">
                We Found the Issue & Fixed It
              </h1>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.7; color: #9ca3af; text-align: center;">
                First, thank you for being one of our beta testers! 🙏
              </p>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.7; color: #9ca3af; text-align: center;">
                We noticed your upload <strong style="color: #ffffff;">"${recipient.title}"</strong> ran into a processing hiccup. Our engineering team identified the root cause and deployed a fix.
              </p>
              
              ${customMessage ? `
              <div style="background: rgba(34, 211, 238, 0.1); border-radius: 8px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #22d3ee;">
                <div style="font-size: 14px; color: #9ca3af; line-height: 1.6;">
                  ${customMessage}
                </div>
              </div>
              ` : ''}
              
              <!-- Status Box -->
              <div style="background: rgba(16, 185, 129, 0.1); border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 3px solid #10b981;">
                <div style="font-size: 14px; color: #10b981; font-weight: 600; margin-bottom: 8px;">✓ What We've Done:</div>
                <ul style="margin: 0; padding-left: 20px; color: #9ca3af; font-size: 14px; line-height: 1.8;">
                  <li>Identified the processing issue with large video files</li>
                  <li>Deployed infrastructure improvements</li>
                  <li>Requeued your video for processing</li>
                </ul>
              </div>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%); color: #000000; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 14px rgba(34, 211, 238, 0.3);">
                      Check Processing Status →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Next Steps -->
              <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;">
                <div style="font-size: 14px; color: #ffffff; font-weight: 600; margin-bottom: 12px;">What happens next:</div>
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">
                      📧 <span style="color: #22d3ee;">You'll receive an email</span> when your Thinking Layer is ready
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">
                      ⏱️ <span style="color: #a78bfa;">Estimated time:</span> 15-45 minutes depending on video length
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">
                      🔄 <span style="color: #10b981;">No action needed</span> - just sit back and relax!
                    </td>
                  </tr>
                </table>
              </div>
              
            </td>
          </tr>
          
          <!-- Personal Note -->
          <tr>
            <td style="padding: 24px 0;">
              <div style="background: rgba(168, 85, 247, 0.1); border-radius: 8px; padding: 20px; border: 1px solid rgba(168, 85, 247, 0.2);">
                <div style="font-size: 14px; color: #a78bfa; font-weight: 600; margin-bottom: 8px;">💜 A Note from the Founder</div>
                <div style="font-size: 14px; color: #9ca3af; line-height: 1.6;">
                  Thank you for your patience during our beta phase. Your feedback is invaluable as we build the future of AI-readable video content. We're committed to making OneDuo rock-solid for you.
                </div>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                Questions? Just reply to this email - we read every message.
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
      } else if (type === 'processing_update') {
        subject = `⏳ Processing Update - "${recipient.title}"`;
        html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="min-width: 320px; background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px;">
          <tr>
            <td style="text-align: center; padding-bottom: 32px;">
              <div style="font-size: 28px; font-weight: 700; color: #22d3ee;">OneDuo</div>
            </td>
          </tr>
          <tr>
            <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1);">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; text-align: center; color: #ffffff;">
                ⏳ Your Video is Processing
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #9ca3af; text-align: center;">
                Great news! <strong style="color: #ffffff;">"${recipient.title}"</strong> is currently being transformed into your AI Thinking Layer.
              </p>
              ${customMessage ? `<p style="text-align: center; color: #9ca3af;">${customMessage}</p>` : ''}
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%); color: #000000; text-decoration: none; font-weight: 600; border-radius: 8px;">
                      Watch Progress Live →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;
      }

      try {
        await resend.emails.send({
          from: 'OneDuo <hello@oneduo.ai>',
          to: [recipient.email],
          subject,
          html,
        });
        
        console.log(`[send-status-notification] Email sent to ${recipient.email}`);
        results.push({ email: recipient.email, success: true });

        // Log the notification
        await supabase.from('artifact_access_log').insert({
          course_id: recipient.courseId,
          access_type: `notification_${type}`,
          download_source: 'system',
        });

      } catch (emailError) {
        console.error(`[send-status-notification] Failed to send to ${recipient.email}:`, emailError);
        results.push({ email: recipient.email, success: false, error: String(emailError) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return new Response(
      JSON.stringify({ 
        success: true,
        sent: successCount,
        total: recipients.length,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-status-notification] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
