import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function can be triggered by a cron job or manually to send expiry reminders
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    console.log('[send-expiry-reminders] Starting expiry reminder check...');

    // Find users who scheduled reminders in the last 24 hours (meaning their link will expire soon)
    // Look for reminder_scheduled events where no reminder has been sent yet
    const twentyTwoHoursAgo = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get scheduled reminders that are now due (scheduled 22-24 hours ago = 2 hours before expiry)
    const { data: dueReminders, error: reminderError } = await supabase
      .from('artifact_access_log')
      .select(`
        id,
        course_id,
        accessed_at
      `)
      .eq('access_type', 'reminder_scheduled')
      .gte('accessed_at', twentyFourHoursAgo)
      .lte('accessed_at', twentyTwoHoursAgo)
      .order('accessed_at', { ascending: true })
      .limit(50);

    if (reminderError) {
      console.error('[send-expiry-reminders] Error fetching reminders:', reminderError);
      throw reminderError;
    }

    console.log(`[send-expiry-reminders] Found ${dueReminders?.length || 0} due reminders`);

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No reminders due' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get unique course IDs
    const courseIds = [...new Set(dueReminders.map(r => r.course_id))];
    
    // Fetch course details and check if reminder was already sent
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, title, email, share_token')
      .in('id', courseIds)
      .eq('status', 'completed');

    if (courseError) {
      console.error('[send-expiry-reminders] Error fetching courses:', courseError);
      throw courseError;
    }

    // Check which courses already had reminders sent
    const { data: sentReminders } = await supabase
      .from('artifact_access_log')
      .select('course_id')
      .in('course_id', courseIds)
      .in('access_type', ['expiry_reminder_sent', 'reminder_sent']);

    const sentCourseIds = new Set(sentReminders?.map(r => r.course_id) || []);

    let processed = 0;
    let sent = 0;

    for (const course of courses || []) {
      // Skip if reminder already sent
      if (sentCourseIds.has(course.id)) {
        console.log(`[send-expiry-reminders] Skipping ${course.id} - reminder already sent`);
        continue;
      }

      processed++;

      if (resend) {
        const baseUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
        const accessLink = `${baseUrl}/track-download?courseId=${course.id}&source=email&token=${course.share_token}`;
        const dashboardLink = supabaseUrl.replace('.supabase.co', '.lovable.app') + '/dashboard';

        const emailHtml = `
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
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">AI's Thinking Layer</div>
            </td>
          </tr>
          
          <tr>
            <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1);">
              
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 64px; height: 64px; background: rgba(251, 191, 36, 0.1); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="font-size: 28px;">⏰</span>
                </div>
              </div>
              
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; text-align: center; color: #ffffff;">
                Your Access Link Expires Soon!
              </h1>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #9ca3af; text-align: center;">
                Your secure access link for <strong style="color: #ffffff;">"${course.title}"</strong> will expire in approximately <strong style="color: #fbbf24;">2 hours</strong>.
              </p>
              
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${accessLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #000000; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">
                      Download Now Before It Expires →
                    </a>
                  </td>
                </tr>
              </table>
              
              <div style="background: rgba(251, 191, 36, 0.1); border-radius: 8px; padding: 16px; border-left: 3px solid #fbbf24;">
                <div style="font-size: 14px; color: #fbbf24; font-weight: 600; margin-bottom: 4px;">Need more time?</div>
                <div style="font-size: 13px; color: #9ca3af; line-height: 1.5;">
                  You can always generate a new secure link from your <a href="${dashboardLink}" style="color: #22d3ee; text-decoration: none;">OneDuo Dashboard</a>.
                </div>
              </div>
              
            </td>
          </tr>
          
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #4b5563;">
                © ${new Date().getFullYear()} OneDuo. You received this because you enabled expiry reminders.
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
            to: [course.email],
            subject: `⏰ Link expiring soon: ${course.title}`,
            html: emailHtml,
          });

          sent++;
          console.log(`[send-expiry-reminders] Sent reminder for course ${course.id}`);

          // Log that reminder was sent to prevent duplicates
          await supabase.from('artifact_access_log').insert({
            course_id: course.id,
            access_type: 'reminder_sent',
            download_source: 'automatic_cron',
          });
        } catch (emailError) {
          console.error(`[send-expiry-reminders] Failed to send email for ${course.id}:`, emailError);
        }
      }
    }

    console.log(`[send-expiry-reminders] Completed. Processed: ${processed}, Sent: ${sent}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed,
        sent,
        message: `Processed ${processed} reminders, sent ${sent} emails`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-expiry-reminders] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
