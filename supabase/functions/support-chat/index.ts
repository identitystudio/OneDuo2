import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, userEmail, courseId, message, conversationId } = await req.json();

    console.log(`[support-chat] Action: ${action}, Email: ${userEmail ? userEmail.substring(0, 3) + '***' : 'none'}`);

    // ============ INPUT VALIDATION ============
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Validate email format when provided
    if (userEmail) {
      if (typeof userEmail !== 'string' || userEmail.length > 255) {
        return new Response(JSON.stringify({ error: "Invalid email format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!emailRegex.test(userEmail)) {
        return new Response(JSON.stringify({ error: "Invalid email format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Validate message length
    if (message && (typeof message !== 'string' || message.length > 5000)) {
      return new Response(JSON.stringify({ error: "Message too long (max 5000 characters)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting for conversation creation
    if (action === "get-or-create-conversation" && userEmail) {
      // Check how many conversations this email has created in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("support_conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_email", userEmail)
        .gte("created_at", oneHourAgo);

      if (count && count >= 5) {
        return new Response(JSON.stringify({ error: "Too many conversations. Please wait before starting a new one." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Rate limiting for messages
    if (action === "send-message" && conversationId) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("support_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("role", "user")
        .gte("created_at", oneHourAgo);

      if (count && count >= 30) {
        return new Response(JSON.stringify({ error: "Too many messages. Please wait before sending more." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    switch (action) {
      // ============ START OR GET CONVERSATION ============
      case "get-or-create-conversation": {
        if (!userEmail) {
          return new Response(JSON.stringify({ error: "Email required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check for existing open conversation
        let { data: conversation } = await supabase
          .from("support_conversations")
          .select("*")
          .eq("user_email", userEmail)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!conversation) {
          // Create new conversation
          const { data: newConv, error } = await supabase
            .from("support_conversations")
            .insert({
              user_email: userEmail,
              course_id: courseId || null,
            })
            .select()
            .single();

          if (error) throw error;
          conversation = newConv;

          // Add welcome message
          await supabase.from("support_messages").insert({
            conversation_id: conversation.id,
            role: "assistant",
            content: `Hi! 👋 I'm your OneDuo AI assistant. I can help you with:

• Understanding how to use your processed courses
• Troubleshooting upload or processing issues
• Tips for getting the best results from your OneDuo PDFs
• Any questions about sharing with your team

What can I help you with today?`,
          });
        }

        // Fetch messages
        const { data: messages } = await supabase
          .from("support_messages")
          .select("*")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true });

        return new Response(JSON.stringify({
          conversation,
          messages: messages || []
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ SEND MESSAGE & GET AI RESPONSE ============
      case "send-message": {
        if (!conversationId || !message) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Save user message
        await supabase.from("support_messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: message,
        });

        // Get conversation history
        const { data: history } = await supabase
          .from("support_messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(20);

        // Get conversation details for context
        const { data: conv } = await supabase
          .from("support_conversations")
          .select("*, courses(title, status, error_message)")
          .eq("id", conversationId)
          .single();

        // Build context about user's courses
        let courseContext = "";
        if (conv?.course_id) {
          const { data: course } = await supabase
            .from("courses")
            .select("title, status, error_message, progress, video_duration_seconds")
            .eq("id", conv.course_id)
            .single();

          if (course) {
            courseContext = `User is asking about course: "${course.title}" (Status: ${course.status}, Progress: ${course.progress}%${course.error_message ? `, Error: ${course.error_message}` : ""})`;
          }
        }

        // Get all user courses for broader context
        if (userEmail) {
          const { data: userCourses } = await supabase
            .from("courses")
            .select("title, status, created_at")
            .eq("email", userEmail)
            .order("created_at", { ascending: false })
            .limit(5);

          if (userCourses?.length) {
            courseContext += `\n\nUser's recent courses: ${userCourses.map(c => `"${c.title}" (${c.status})`).join(", ")}`;
          }
        }

        // Call Lovable AI
        const systemPrompt = `You are the OneDuo AI Support Assistant. You help users with their video-to-PDF processing platform.

PRODUCT KNOWLEDGE:
- OneDuo processes video courses into AI-readable PDFs with frames, transcripts, and visual analysis
- Users upload videos, we transcribe + extract frames, then generate a ChatGPT-optimized PDF
- PDFs can be shared with teams via link or downloaded directly
- Supported: Direct uploads, Loom, Vimeo links
- Processing typically takes 5-15 minutes depending on video length
- Videos are auto-deleted after processing for security

COMMON ISSUES & SOLUTIONS:
- "Processing stuck": Usually resolves within 15 min. Check dashboard for progress. Can retry from dashboard.
- "File too large": Recommend splitting into modules under 1 hour each
- "Vimeo not working": Ensure video is set to public or unlisted with download enabled
- "PDF not generating": Try clearing browser cache and re-downloading
- "Can't find my course": Make sure using same email as upload

${courseContext}

TONE:
- Be helpful, friendly, and concise
- Don't over-explain unless asked
- If you can't solve something, acknowledge it honestly
- For technical issues you can't diagnose, suggest they retry or wait a few minutes

NEVER:
- Make up features that don't exist
- Promise things you can't deliver
- Ask them to contact support (you ARE the support!)`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
        ];

        let aiResponse = "I apologize, but I'm having trouble responding right now. Please try again in a moment.";

        if (OPENAI_API_KEY) {
          try {
            const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o",
                messages,
                max_tokens: 1000,
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              aiResponse = aiData.choices?.[0]?.message?.content || aiResponse;
            } else {
              console.error("[support-chat] AI error:", await aiResp.text());
            }
          } catch (e) {
            console.error("[support-chat] AI call failed:", e);
          }
        }

        // Save AI response
        await supabase.from("support_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: aiResponse,
        });

        // Update conversation timestamp
        await supabase.from("support_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        return new Response(JSON.stringify({
          response: aiResponse,
          success: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ EMAIL CONVERSATION SUMMARY ============
      case "email-summary": {
        if (!conversationId || !userEmail) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
          console.log("[support-chat] No RESEND_API_KEY configured");
          return new Response(JSON.stringify({ error: "Email not configured" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get conversation messages
        const { data: messages } = await supabase
          .from("support_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (!messages?.length) {
          return new Response(JSON.stringify({ error: "No messages found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Format conversation for email
        const formattedMessages = messages.map(m => {
          const timestamp = new Date(m.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const sender = m.role === 'user' ? 'You' : 'OneDuo AI';
          return `<div style="margin-bottom: 16px;">
            <p style="margin: 0 0 4px; color: #666; font-size: 12px;">${sender} • ${timestamp}</p>
            <p style="margin: 0; color: #333; white-space: pre-wrap;">${m.content}</p>
          </div>`;
        }).join('');

        const resend = new Resend(resendApiKey);
        const appUrl = Deno.env.get("APP_URL") || "https://seevahdone.lovable.app";

        await resend.emails.send({
          from: "OneDuo Support <hello@oneduo.ai>",
          to: [userEmail],
          subject: "Your OneDuo Support Conversation",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #00d4ff; margin: 0;">OneDuo</h1>
                <p style="color: #666; margin: 10px 0 0;">Support Conversation Summary</p>
              </div>
              
              <div style="background: #f9f9f9; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                ${formattedMessages}
              </div>
              
              <div style="text-align: center;">
                <a href="${appUrl}/dashboard" style="display: inline-block; background: #00d4ff; color: #000; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px;">
                  Go to Dashboard
                </a>
              </div>
              
              <p style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
                This is an automated summary of your support conversation with OneDuo AI.
              </p>
            </body>
            </html>
          `,
        });

        // Mark messages as emailed
        await supabase.from("support_messages")
          .update({ emailed_to_user: true, email_sent_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("emailed_to_user", false);

        console.log("[support-chat] Email summary sent to", userEmail);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============ RESOLVE CONVERSATION ============
      case "resolve": {
        if (!conversationId) {
          return new Response(JSON.stringify({ error: "Conversation ID required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase.from("support_conversations")
          .update({ status: "resolved", updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err: any) {
    console.error("[support-chat] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
