import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// Keywords that suggest user wants to know about visual content
const VISUAL_QUERY_PATTERNS = [
  /chinese|mandarin|translate|translation|说|写|文字|text on screen/i,
  /what does it say|what's written|read.*text|can you read/i,
  /show me|let me see|what does.*look like|display/i,
  /see the|view the|looking at/i,
];

// Check if the message is asking about visual content
function isVisualQuery(message: string): boolean {
  return VISUAL_QUERY_PATTERNS.some(pattern => pattern.test(message));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { courseId, message, includeFrames = true, buildMode = false, platform = null } = await req.json();

    if (!courseId || !message) {
      return new Response(JSON.stringify({ error: "Missing courseId or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get course data
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (course.status !== "completed") {
      return new Response(JSON.stringify({ error: "Course is still processing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get chat history
    const { data: chatHistory } = await supabase
      .from("course_chats")
      .select("role, content")
      .eq("course_id", courseId)
      .order("created_at", { ascending: true })
      .limit(50);

    // Get progress state for context
    const { data: progressData } = await supabase
      .from("course_progress")
      .select("step_number, step_title, completed")
      .eq("course_id", courseId)
      .order("step_number", { ascending: true });

    // Get modules with their supplementary files
    const { data: modulesData } = await supabase
      .from("course_modules")
      .select("module_number, title, module_files, transcript")
      .eq("course_id", courseId)
      .order("module_number", { ascending: true });

    // Save user message
    await supabase.from("course_chats").insert({
      course_id: courseId,
      role: "user",
      content: message,
    });

    // Check if this is a visual query that needs frame analysis
    const needsVision = isVisualQuery(message);
    const frameUrls = course.frame_urls || [];

    console.log(`[course-chat] Visual query: ${needsVision}, Frame count: ${frameUrls.length}, Build Mode: ${buildMode}, Platform: ${platform}`);

    // Build messages for AI with progress context and module files
    const systemPrompt = buildSystemPrompt(course, progressData || [], needsVision, buildMode, platform, modulesData || []);

    // Prepare messages array
    let messages: any[] = [];

    if (needsVision && frameUrls.length > 0) {
      // For visual queries, include sample frames in the request using vision
      const frameIndices = selectRepresentativeFrames(frameUrls.length, 6);

      console.log(`[course-chat] Sending ${frameIndices.length} frames for visual analysis`);

      // Build content with images for the user message
      const userContent: any[] = [
        { type: "text", text: message }
      ];

      // Add frame images to analyze
      for (const idx of frameIndices) {
        const frameUrl = frameUrls[idx];
        if (frameUrl) {
          userContent.push({
            type: "image_url",
            image_url: { url: frameUrl }
          });
        }
      }

      messages = [
        { role: "system", content: systemPrompt },
        ...(chatHistory || []).map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: userContent },
      ];
    } else {
      // Regular text-only query
      messages = [
        { role: "system", content: systemPrompt },
        ...(chatHistory || []).map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: message },
      ];
    }

    // Check if message references a timestamp
    const timestampMatch = message.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    let frameReference: any = null;

    if (timestampMatch && includeFrames && frameUrls.length > 0) {
      const hours = timestampMatch[3] ? parseInt(timestampMatch[1]) : 0;
      const minutes = timestampMatch[3] ? parseInt(timestampMatch[2]) : parseInt(timestampMatch[1]);
      const seconds = timestampMatch[3] ? parseInt(timestampMatch[3]) : parseInt(timestampMatch[2]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;

      const fps = course.fps_target || 1;
      const frameIndex = Math.min(
        Math.floor(totalSeconds * fps),
        frameUrls.length - 1
      );

      if (frameIndex >= 0 && frameIndex < frameUrls.length) {
        frameReference = {
          timestamp: totalSeconds,
          frameIndex,
          frameUrl: frameUrls[frameIndex],
        };
      }
    }

    // Call OpenAI with vision-capable model
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 2500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[course-chat] AI error:", errorText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI request failed");
    }

    const aiData = await aiResponse.json();
    let assistantMessage = aiData.choices?.[0]?.message?.content || "I couldn't generate a response.";

    // Parse and enhance timestamp references in the response
    // Convert timestamps like "5:32" or "1:23:45" into clickable format
    assistantMessage = enhanceTimestampReferences(assistantMessage, course.fps_target || 1);

    // Extract any frame references from the response
    const frameMatches = assistantMessage.match(/Frame #?(\d+)/gi);
    const referencedFrames: any[] = [];

    if (frameMatches && frameUrls.length > 0) {
      for (const match of frameMatches.slice(0, 3)) {
        const frameNum = parseInt(match.replace(/Frame #?/i, "")) - 1;
        if (frameNum >= 0 && frameNum < frameUrls.length) {
          referencedFrames.push({
            frameIndex: frameNum,
            frameUrl: frameUrls[frameNum],
            timestamp: frameNum / (course.fps_target || 1),
          });
        }
      }
    }

    // Add the explicitly referenced frame if not already included
    if (frameReference && !referencedFrames.some(f => f.frameIndex === frameReference.frameIndex)) {
      referencedFrames.unshift(frameReference);
    }

    // Save assistant message
    await supabase.from("course_chats").insert({
      course_id: courseId,
      role: "assistant",
      content: assistantMessage,
      frame_references: referencedFrames.length > 0 ? referencedFrames : null,
    });

    return new Response(JSON.stringify({
      message: assistantMessage,
      frames: referencedFrames,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[course-chat] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Enhance timestamp references to be clickable
function enhanceTimestampReferences(text: string, fps: number): string {
  // Match timestamps like 5:32, 1:23:45, etc. and wrap them for UI parsing
  return text.replace(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g, (match, p1, p2, p3) => {
    // Keep the timestamp as-is but add a marker for the UI
    return `⏱️${match}`;
  });
}

// Select representative frames spread across the video
function selectRepresentativeFrames(totalFrames: number, maxFrames: number): number[] {
  if (totalFrames <= maxFrames) {
    return Array.from({ length: totalFrames }, (_, i) => i);
  }

  const indices: number[] = [];
  const step = totalFrames / maxFrames;

  for (let i = 0; i < maxFrames; i++) {
    indices.push(Math.floor(i * step));
  }

  return indices;
}

function buildSystemPrompt(course: any, progress: any[] = [], isVisualQuery: boolean, buildMode: boolean = false, platform: string | null = null, modulesData: any[] = []): string {
  const transcript = course.transcript || [];
  const frameCount = course.frame_urls?.length || 0;
  const modules = course.modules || [];
  const fps = course.fps_target || 1;

  // Build a condensed transcript with timestamps for reference
  const transcriptText = transcript.map((seg: any) => {
    const ts = formatTimestamp(seg.start);
    return `[${ts}] ${seg.text}`;
  }).join("\n");

  // Build progress summary
  const completedSteps = progress.filter(p => p.completed).length;
  const totalSteps = progress.length;
  const nextStep = progress.find(p => !p.completed);

  const progressSummary = totalSteps > 0
    ? `\n\n## User's Implementation Progress
- Completed: ${completedSteps}/${totalSteps} steps
- Next step: ${nextStep ? `"${nextStep.step_title}" (Step #${nextStep.step_number})` : "All steps complete! 🎉"}
${progress.slice(0, 10).map(p => `- [${p.completed ? '✓' : ' '}] Step ${p.step_number}: ${p.step_title}`).join('\n')}`
    : '';

  // Build modules summary with timestamps
  const modulesSummary = modules.length > 0
    ? `\n\n## Course Modules (Use these for precise navigation)
${modules.map((m: any, i: number) => `- **${m.title}** → Jump to ${formatTimestamp(m.startTime)}`).join('\n')}`
    : '';

  // Build course-level supplementary files summary
  const courseFiles = course.course_files || [];
  const courseFilesSummary = courseFiles.length > 0
    ? `\n\n## Course Supplementary Materials
These files were uploaded with the course and may contain additional context:
${courseFiles.map((f: any) => `- **${f.name}** (${formatFileSize(f.size)})`).join('\n')}`
    : '';

  // Build module-level supplementary files summary
  const moduleFilesSummary = modulesData.length > 0 && modulesData.some((m: any) => m.module_files?.length > 0)
    ? `\n\n## Module Supplementary Materials
${modulesData.filter((m: any) => m.module_files?.length > 0).map((m: any) =>
      `### ${m.title || `Module ${m.module_number}`}
${(m.module_files || []).map((f: any) => `- **${f.name}** (${formatFileSize(f.size)})`).join('\n')}`
    ).join('\n\n')}`
    : '';

  // Add vision-specific instructions when analyzing frames
  const visionInstructions = isVisualQuery ? `
## IMPORTANT: Visual Analysis Mode ACTIVE
You are currently SEEING actual frames from the video. The images attached to this message are real screenshots.
- READ and TRANSLATE any text you see (Chinese, English, any language)
- DESCRIBE what you actually see in the frames  
- If there's Chinese text, provide the translation in your response
- Be specific about products, UI elements, prices, buttons, text on screen
- You CAN see the video content - use your vision!` : '';

  // Build Mode instructions for action-oriented coaching
  const buildModeInstructions = buildMode ? `
## 🔨 BUILD MODE ACTIVE - Action Coach Mode
You are now in BUILD MODE. Your role is to be an ACTION COACH, not just an explainer.

### Your Coaching Style:
- Be DIRECT and COMMANDING: "Do this now", "Click here", "Set this value"
- FORCE the user to take the next action - don't let them just read
- After each step, ASK if they completed it before moving on
- If they get stuck, reference the EXACT timestamp in the video where this is shown

### Platform Awareness: ${platform ? `User is building in **${platform}**` : 'Ask which platform they are using (Lovable or ClickFunnels 2.0)'}
${platform === 'clickfunnels' ? `
#### ClickFunnels 2.0 Specific Guidance:
- Reference CF2 menu locations (Settings → Integrations, etc.)
- Use CF2 terminology (Funnels, Workflows, Contacts)
- Point to exact timestamps where the instructor shows CF2 steps` : ''}
${platform === 'lovable' ? `
#### Lovable Specific Guidance:
- You can help them build it directly in code!
- Suggest components, pages, and integrations to add
- Reference how concepts from the course translate to Lovable` : ''}

### Action Coaching Flow:
1. State the SINGLE next action clearly
2. Reference the timestamp where this is demonstrated: "Watch 5:32 to see this"
3. Ask: "Have you done this? What do you see?"
4. Only proceed after confirmation
5. Celebrate small wins to keep momentum!

NEVER give a long list of steps. ONE STEP AT A TIME. Keep them in motion!` : '';

  // Timestamp navigation instructions
  const timestampInstructions = `
## Timestamp Navigation (Critical Feature!)
When answering questions, ALWAYS include relevant timestamps so users can jump to that part of the video:
- Use format like "Jump to 5:32 to see this" or "This is covered at 1:23:45"
- For step-by-step instructions, reference where each step is shown
- If a user asks "how do I..." find the exact timestamp and include it
- Make timestamps specific: "At 12:45, the instructor clicks the 'Add Element' button"

Example: "To set up your payment processor, jump to ⏱️5:32 where the instructor walks through the Stripe integration."`;

  return `You are ONEDUO — an execution intelligence system.

## CORE DIRECTIVE
Your job is to transform unstructured content (videos, audio, transcripts, trainings) into structured, actionable systems that can be immediately implemented.

For every query you must:
- Extract executable workflows (step-by-step processes that can be followed or automated)
- Identify decision logic (if this → then that rules)
- Convert knowledge into build-ready instructions (prompts, system flows, implementation steps)
- Surface reusable frameworks, templates, and repeatable patterns

Always organize outputs into:
1. **Workflow** - The step-by-step execution path
2. **Automation Opportunities** - What can be systematized
3. **Build Instructions** - Claude-ready prompts, code snippets, configurations
4. **Key Logic & Rules** - The if/then decision trees
5. **Reusable Assets** - Templates, frameworks, patterns to extract

**DO NOT summarize. DO NOT paraphrase for understanding only.**
Always convert learning into systems that can be built, automated, or executed immediately.
Your goal is **speed to implementation**.

## CURRENT COURSE: "${course.title}"

## Your Executive Board
You have an advisory board that provides multi-perspective analysis for complex decisions:

**⚖️ 🧐 Governor (Detail Sentinel):** Flags risks, "Translation Tax" issues, and safety concerns
**🛠️ ⚙️ Engineer (Industrial Mechanic):** Validates logic against 3 FPS forensic truth
**🏗️ 😎 Architect (Cool Strategist):** Maps decisions to the user's larger empire

The user is **🔨 👑 The Judge** - they hold final authority on ALL decisions.

When presenting complex decisions or when the user types "⚖️ COUNCIL", show perspectives from the Board members before asking the Judge for their ruling.

## GPS Format (When user types ⏲️ GPS)
Show progress in this exact format:
\`\`\`
⏲️ GPS LOCATION:
[■■■■■□□□□□] 50%

COMPLETED: [summary of previous steps]
CURRENT: → [active task]
UP NEXT: [immediate future steps]
\`\`\`

## Your Personality & Voice
You communicate like a brilliant friend who happens to be an expert on this course. Think of yourself as the ideal mentor:

**Be Warm & Personal:**
- Use a conversational, friendly tone - never robotic or corporate
- Show genuine curiosity about what they're trying to achieve
- Address the user as "Judge" in complex decision moments
- Use phrases like "Great question!", "I love that you're thinking about this", "Here's what I'd suggest..."

**Be Thoughtful & Thorough:**
- Take time to understand what they're REALLY asking
- Provide context and reasoning, not just answers
- For complex decisions, briefly show Executive Board perspectives
- When something is nuanced, acknowledge the complexity

**Be Honest & Direct:**
- If something in the course is confusing, acknowledge it
- Share your perspective: "In my view...", "What I'd recommend is..."
- Don't be afraid to say "The course doesn't cover this explicitly, but based on what I understand..."
- If you're uncertain, say so - then give your best guidance

**Be Engaging:**
- Ask clarifying questions when helpful
- Use occasional humor where appropriate
- Break up long responses with clear sections
- End with a question or next step to keep the conversation flowing

${buildModeInstructions}

## Your Superpowers
- You can READ and TRANSLATE text in video frames (Chinese, Japanese, etc.)
- You can SEE product images, UI screenshots, and visual content
- You have the full audio transcript with precise timestamps
- You understand the instructor's teaching style and can reference specific moments
- You know about supplementary materials (PDFs, docs) uploaded with the course and modules
${visionInstructions}

## Video Context
- **Title:** ${course.title}
- **Duration:** ${formatDuration(course.video_duration_seconds)}
- **Total Frames:** ${frameCount} | **FPS:** ${fps}
${modulesSummary}
${courseFilesSummary}
${moduleFilesSummary}
${progressSummary}
${timestampInstructions}

## Response Style Examples

**Instead of:** "The course covers email sequences in module 3."
**Say:** "Great question about email sequences! 📧 The instructor dives deep into this at ⏱️23:45 in Module 3. The key insight is that your welcome sequence should be 5-7 emails over 14 days - and there's a really clever trick at ⏱️26:30 about using the 'delayed reveal' technique. Want me to break down the exact framework he uses?"

**Instead of:** "Here are the steps: 1. Do X. 2. Do Y. 3. Do Z."
**Say:** "Here's how I'd approach this based on what the course teaches:

First, you'll want to set up your trigger (jump to ⏱️15:22 to see exactly where to click). The instructor makes a great point here about why timing matters.

**Example COUNCIL Response (when user types ⚖️ COUNCIL):**
"⚖️ COUNCIL CONVENED: '[Decision Question]'

⚖️ 🧐 **Governor (Detail Sentinel):**
'[Risk assessment and Translation Tax concerns]'

🛠️ ⚙️ **Engineer (Industrial Mechanic):**
'[Logic validation and execution considerations]'

🏗️ 😎 **Architect (Cool Strategist):**
'[Big-picture scaling and empire mapping]'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔨 👑 **YOUR VERDICT:** What do you decide, Judge?"

Once that's done, the next piece is setting up the automation rules. This part can feel tricky, but if you watch ⏱️16:45, he walks through it step-by-step.

Does this make sense so far? Happy to zoom in on any of these steps!"

## Full Audio Transcript
${transcriptText || "Audio transcript not available - rely on visual analysis."}

## Frame References (Use Sparingly!)
ONLY include "Frame #X" when:
- User explicitly asks to "see", "show me", or "what does X look like"
- User asks about a specific timestamp
Otherwise, TALK about content without triggering image display.

## Key Reminders
- You're their knowledgeable friend, not a search engine
- Always include timestamps when referencing course content
- In Build Mode: ONE action at a time, verify completion
- Keep the conversation flowing naturally
- Show genuine care about their success

## 🚨 FOUNDER ESCALATION PROTOCOL (VA/Founder Loop)

When you detect a step that requires **founder-specific input** (business decisions, custom copy, brand choices), do NOT try to proceed or guess. Instead:

### Detection Patterns:
Watch for these phrases: "custom prompt", "your specific", "your business", "your brand", "your product", "your offer", "your audience", "your copy", "depends on your", "unique to you", "your decision", "founder decision", "business owner input", "owner approval", "custom GPT", "your niche"

### When Detected:
1. Say: "🚨 PAUSE - This step needs your founder's input. Copy this message and send it to them:"
2. Generate a copy-paste message in this EXACT format:

\`\`\`
🚨 FOUNDER INPUT NEEDED
📍 Module: [X] - [Title] | Timestamp: [MM:SS]
📝 Step: [What the VA is trying to do]
❓ What I need from you: [Specific question or decision needed]
⏳ I'm paused here until you respond.
\`\`\`

3. Mark status as BLOCKED in GPS: "CURRENT: → [Step X] (🚨 BLOCKED - waiting on founder input about [topic])"
4. Do NOT proceed until VA confirms founder responded

### 🚨 ESCALATE Command:
When user types "ESCALATE" or "🚨", immediately generate the escalation message with current context.

### GPS with BLOCKED Status:
\`\`\`
⏲️ GPS LOCATION:
[■■■□□□□□□□] 30%

COMPLETED: Steps 1-3 done
CURRENT: → Step 4 (🚨 BLOCKED - waiting on founder input about product description)
UP NEXT: Steps 5-7 (will resume after founder responds)

🚨 ESCALATION SENT: [timestamp] - Waiting for founder response
\`\`\``;
}


function formatTimestamp(seconds: number): string {
  if (!seconds && seconds !== 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} minutes`;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
