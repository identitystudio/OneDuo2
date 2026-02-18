import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendEmailRequest {
    courseId: string;
    email: string;
    filePath: string;
    fileName: string;
}

// Helper to generate a secure random token
function generateToken(length = 32): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const resendApiKey = Deno.env.get('RESEND_API_KEY');

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const resend = resendApiKey ? new Resend(resendApiKey) : null;

        const { courseId, email, filePath, fileName } = await req.json() as SendEmailRequest;

        if (!courseId || !email || !filePath) {
            return new Response(
                JSON.stringify({ error: 'Missing courseId, email, or filePath' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get course title
        const { data: course } = await supabase
            .from('courses')
            .select('title')
            .eq('id', courseId)
            .single();

        const courseTitle = course?.title || 'Your OneDuo Artifact';
        const token = generateToken(32);

        // Insert into pdf_exports
        const { error: dbError } = await supabase
            .from('pdf_exports')
            .insert({
                course_id: courseId,
                email: email,
                file_path: filePath,
                token: token,
            });

        if (dbError) {
            console.error('[send-pdf-email] Database error:', dbError);
            throw new Error('Failed to create export record');
        }

        // Generate download link (Landing page on the app)
        // We assume the app is hosted on the Lovable/Supabase domain or custom domain
        // Using Lovable default pattern based on resend-access-email
        const appUrl = supabaseUrl.replace('.supabase.co', '.lovable.app');
        const downloadLink = `${appUrl}/download-file?token=${token}`;

        // Send the email
        if (resend) {
            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your OneDuo PDF is Ready</title>
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
                  <span style="font-size: 28px;">📄</span>
                </div>
              </div>
              
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; text-align: center; color: #ffffff;">
                Your PDF is Ready
              </h1>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #9ca3af; text-align: center;">
                The Thinking Layer artifact for <strong style="color: #ffffff;">"${courseTitle}"</strong> has been generated and is ready for download.
              </p>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${downloadLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%); color: #000000; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 14px rgba(34, 211, 238, 0.3);">
                      Download PDF Now →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Expiry Notice -->
              <div style="background: rgba(245, 158, 11, 0.1); border-radius: 8px; padding: 16px; border-left: 3px solid #f59e0b;">
                <div style="font-size: 14px; color: #f59e0b; font-weight: 600; margin-bottom: 4px;">⏳ Link Expires Soon</div>
                <div style="font-size: 13px; color: #9ca3af; line-height: 1.5;">
                  For security, this download link will expire in <strong style="color: #ffffff;">24 hours</strong>. 
                  After that, you'll need to regenerate the PDF from your dashboard.
                </div>
              </div>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                OneDuo - Extracting value from every frame.
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

            await resend.emails.send({
                from: 'OneDuo <hello@oneduo.ai>',
                to: [email],
                subject: `📄 Your OneDuo PDF: ${courseTitle}`,
                html: emailHtml,
            });

            console.log(`[send-pdf-email] Email sent to ${email}`);
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Email sent successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[send-pdf-email] Error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
