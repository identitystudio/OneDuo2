import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendPdfEmailRequest {
    email: string;
    courseTitle: string;
    downloadUrl: string;
    courseId: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
            throw new Error("RESEND_API_KEY is not configured");
        }

        const { email, courseTitle, downloadUrl, courseId } = await req.json() as SendPdfEmailRequest;

        if (!email || !courseTitle || !downloadUrl) {
            throw new Error("Missing required fields (email, courseTitle, downloadUrl)");
        }

        const resend = new Resend(resendApiKey);

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your OneDuo is Ready</title>
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
                Your OneDuo PDF is Ready!
              </h1>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #9ca3af; text-align: center;">
                We've finished generating the Thinking Layer artifact for <strong style="color: #ffffff;">"${courseTitle}"</strong>.
              </p>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${downloadUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%); color: #000000; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 14px rgba(34, 211, 238, 0.3);">
                      Download OneDuo PDF →
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #6b7280; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${downloadUrl}" style="color: #22d3ee; text-decoration: none; word-break: break-all;">${downloadUrl}</a>
              </p>

              <!-- Security Notice -->
              <div style="background: rgba(34, 211, 238, 0.1); border-radius: 8px; padding: 16px; border-left: 3px solid #22d3ee;">
                <div style="font-size: 14px; color: #22d3ee; font-weight: 600; margin-bottom: 4px;">🔒 Secure Link</div>
                <div style="font-size: 13px; color: #9ca3af; line-height: 1.5;">
                  This link is valid for <strong style="color: #ffffff;">24 hours</strong>. After that, you'll need to generate a new one from your dashboard.
                </div>
              </div>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                You can also access this and other artifacts from your 
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

        const { data, error } = await resend.emails.send({
            from: "OneDuo <hello@oneduo.ai>",
            to: [email],
            subject: `📄 Your OneDuo is Ready: ${courseTitle}`,
            html: emailHtml,
        });

        if (error) {
            throw error;
        }

        return new Response(JSON.stringify({ success: true, data }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("[send-pdf-email] Error:", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
