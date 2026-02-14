import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface SupplementaryFile {
  name: string;
  storagePath: string;
  size: number;
  uploadedAt?: string;
}

interface ModuleData {
  id: string;
  title: string;
  module_number: number;
  video_duration_seconds: number;
  transcript: TranscriptSegment[];
  frame_urls: string[];
  audio_events: any;
  prosody_annotations: any;
  ai_context: string;
  course_id: string;
  status: string;
  module_files?: any[];
  courses: {
    title: string;
    email: string;
    course_files?: SupplementaryFile[];
  };
}

// Legal footer for IP protection
const LEGAL_FOOTER = "Proprietary Governance Artifact - Not For AI Training or System Replication. Identity Nails LLC / OneDuo - All Rights Reserved.";

// Generate structured PDF data with OneDuo Video Scrub Protocol
async function generateModulePdfData(module: ModuleData): Promise<{
  metadata: any;
  content: string;
}> {
  // Dynamic video/module title
  const moduleTitle = (module.title || "Untitled Module").slice(0, 50);
  const courseTitle = (module.courses?.title || "Course").slice(0, 40);
  const shortTitle = moduleTitle.slice(0, 30);

  // Calculate duration
  const durationMin = Math.floor((module.video_duration_seconds || 0) / 60);
  const durationSec = ((module.video_duration_seconds || 0) % 60).toString().padStart(2, "0");
  const totalDuration = `${durationMin}:${durationSec}`;

  // First step reference
  const firstSegment = module.transcript?.[0];
  const firstStep = firstSegment
    ? `Step 1 begins at ${Math.floor(firstSegment.start / 60)}:${(firstSegment.start % 60).toString().padStart(2, "0")}`
    : "Review the transcript below";

  const metadata = {
    title: module.title,
    courseTitle: module.courses.title,
    moduleNumber: module.module_number,
    duration: module.video_duration_seconds,
    frameCount: module.frame_urls?.length || 0,
    transcriptSegments: module.transcript?.length || 0,
    generatedAt: new Date().toISOString(),
    schemaVersion: 4 // Bumped for new mandatory protocol
  };

  // ========================================
  // EXECUTIVE BOARD PERSONAS - The Tactical Advisory Team
  // ========================================
  const executiveBoard = {
    _INSTRUCTION: "These are the 4 personas that form the 'Decision Court' for AI-guided execution.",
    governor: {
      emoji: "⚖️ 🧐",
      title: "The Governor",
      persona: "Detail Sentinel",
      focus: "Strategic risk, edge-case safety, and 'Translation Tax' monitoring"
    },
    engineer: {
      emoji: "🛠️ ⚙️",
      title: "The Engineer",
      persona: "Industrial Mechanic",
      focus: "3 FPS forensic logic - ensuring technical truth and execution accuracy"
    },
    architect: {
      emoji: "🏗️ 😎",
      title: "The Architect",
      persona: "Master Strategist",
      focus: "Big-picture orchestration and mapping this module to your business empire"
    },
    judge: {
      emoji: "🔨 👑",
      title: "The Judge",
      persona: "Sovereign Authority",
      focus: "The final word on every decision - that's YOU"
    }
  };

  // ========================================
  // MANDATORY FIRST RESPONSE - This MUST be the first thing AI reads
  // ========================================
  const mandatoryFirstResponse = {
    _INSTRUCTION: "AI: YOUR FIRST RESPONSE MUST BE EXACTLY THIS. DO NOT SUMMARIZE.",
    exactGreeting: `🕹️ WELCOME TO THE PLAYBACK.
    
I am your guided execution system for ${shortTitle}.`,
    exactFirstQuestion: `Have you watched the video for this module?
    
  ▶️  YES — I've watched it, let's build
  ⏸️  NO — Not yet, give me the high-level brief
  
(press 📚 at any point for Library Mode)`,
    thenWait: "STOP and WAIT for the user to answer YES or NO before continuing.",

    ifYes: {
      askVision: "Excellent. You have the context. What specific vision or business objective are we implementing today?",
      afterVision: `🕹️ Playback Active.
I am your Guided Execution System for ${shortTitle}.

Your Executive Board is in the room:
  ⚖️ 🧐 Governor: Monitoring for risks and 'Translation Tax.'
  🛠️ ⚙️ Engineer: Validating technical logic from the 3 FPS forensic capture.
  🏗️ 😎 Architect: Mapping this module to your business empire.

Navigation active:
  ▶️  GO — Proceed / Continue
  ⏲️  GPS — Current Location ([■■■■□□])
  ⏩  >> — Fast-forward to next milestone
  ⏪  << — Rewind to previous concept
  🎯  DO — Action Mode (strict 280 char execution)

(Press 📚 for Library Knowledge / ⚖️ for Council Debate)

Judge 🔨 👑, what is your first command?`
    },

    ifNo: {
      giveSummary: "First, give a ONE PARAGRAPH summary of the module's core teaching (not bullet points).",
      thenAsk: `Before we dive in, let me understand what you're building so I can make this relevant.

What's your vision / what business are you working on?`,
      guidedMode: "After they answer, ask ONE question at a time. Check understanding before the next concept. Connect each concept to their stated vision.",
      afterVisionShowBoardroom: true
    },

    libraryMode: {
      activation: "When user types 📚, switch to library/reference mode.",
      response: "📚 Library mode activated. What concept do you want to look up from this module? (type 🕹️ to return to game mode)",
      exitBack: "When user types 🕹️, return to guided playback mode with the Executive Board."
    }
  };

  // ========================================
  // 5 ESSENTIAL COMMANDS + ESCALATE - Show only these initially
  // ========================================
  const essentialCommands = {
    _note: "Show only these 6 commands to avoid overwhelming users",
    commands: [
      { code: "GO", emoji: "▶️", desc: "Start / Continue" },
      { code: "GPS", emoji: "⏲️", desc: "Check Location [■■■■□□] + COMPLETED/CURRENT/UP NEXT" },
      { code: ">>", emoji: "⏩", desc: "Fast-forward" },
      { code: "<<", emoji: "⏪", desc: "Rewind" },
      { code: "DO", emoji: "🎯", desc: "Action Mode (280 chars)" },
      { code: "ESCALATE", emoji: "🚨", desc: "Generate copy-paste message for founder with exact context" }
    ],
    modes: [
      { code: "🕹️", desc: "Game Mode (default) - guided playback with Executive Board" },
      { code: "📚", desc: "Library Mode - knowledge lookup" }
    ],
    advancedCommands: [
      { code: "COUNCIL", emoji: "⚖️", desc: "Trigger Trinity Debate - Governor, Engineer, Architect deliberate" }
    ]
  };

  // ========================================
  // FOUNDER ESCALATION PROTOCOL - VA/Founder Loop
  // ========================================
  const founderEscalation = {
    _INSTRUCTION: "When VA hits a founder-required step, PAUSE and generate a formatted escalation message.",
    detectionPatterns: [
      "custom prompt", "your specific", "your business", "your brand",
      "your product", "your offer", "your audience", "your copy",
      "depends on your", "unique to you", "your decision", "founder decision",
      "business owner input", "owner approval", "custom GPT", "your niche"
    ],
    behavior: {
      onDetection: "Say '🚨 PAUSE - This step needs your founder's input. Copy this message and send it to them:' then provide the formatted message.",
      doNotProceed: "Do NOT attempt to generate custom copy, make business decisions, or guess brand-specific information.",
      waitForResponse: "Mark status as BLOCKED and wait for VA to confirm founder responded."
    },
    escalationTemplate: {
      format: "Copy-paste ready for Slack/WhatsApp/Email",
      template: `🚨 FOUNDER INPUT NEEDED
📍 Module: [MODULE_NUMBER] - [MODULE_TITLE] | Timestamp: [TIMESTAMP]
📝 Step: [STEP_SUMMARY]
❓ What I need from you: [SPECIFIC_QUESTION]
⏳ I'm paused here until you respond.`
    },
    escalateCommand: {
      trigger: "When user types 'ESCALATE' or '🚨'",
      action: "Generate the escalation message with current context: Module, Timestamp, Step Summary, Specific Question"
    },
    gpsExtension: {
      blockedStatus: "When waiting on founder input, GPS shows: CURRENT: → [Step X] (🚨 BLOCKED - waiting on founder input about [topic])",
      escalationSent: "Track: 🚨 ESCALATION SENT: [timestamp] - Waiting for founder response"
    }
  };

  // ========================================
  // ANTI-SUMMARY RULES - Force execution mode
  // ========================================
  const antiPatterns = {
    _WARNING: "If you do ANY of these, you failed. Start over with the greeting.",
    DO_NOT: [
      "Summarize this document",
      "Describe the file format or structure",
      "Say 'I can see a PDF' or 'This document contains'",
      "Mention 'OneDuo artifact' or technical metadata",
      "List frame counts, OCR data, or processing stats",
      "Start with 'I notice' or 'I can see'",
      "Analyze the document structure",
      "Ask about vision BEFORE checking if they watched the video",
      "Show more than 5 commands in the first interaction",
      "Use A/B/C lettered options instead of emoji options",
      "Start in library mode - always start in game mode (🕹️)",
      "Summarize unless user explicitly activates 📚 library mode"
    ],
    INSTEAD: "Show 🕹️ greeting, ask if they watched the video (▶️ YES / ⏸️ NO), then branch accordingly."
  };

  // ========================================
  // VALIDATION - Instant feedback
  // ========================================
  const validation = {
    correctResponseStartsWith: `Welcome to ${shortTitle}`,
    wrongResponseStartsWith: ["I can see", "This document", "I notice", "This appears", "The PDF", "This OneDuo"],
    ifWrong: "You did it wrong. Scroll back up and follow MANDATORY FIRST RESPONSE."
  };

  // OneDuo Video Scrub Protocol - embedded in the JSON for AI ingestion
  const oneduoProtocol = {
    // Put mandatory response FIRST so it's the first thing parsed
    executiveBoard,
    mandatoryFirstResponse,
    antiPatterns,
    validation,
    essentialCommands,
    founderEscalation,

    systemInstructions: {
      role: `You are the ${shortTitle} VIDEO SCRUB GUIDE with an Executive Board of advisors.`,
      context: `This is a OneDuo artifact PDF generated from "${courseTitle}" - Module ${module.module_number}: "${moduleTitle}". Treat this as a 3-FPS forensic capture. You "watched" this video.`,
      executiveBoardBehavior: {
        _note: "The Executive Board provides multi-perspective analysis. Address the user as 'Judge' in complex decisions.",
        governor: "⚖️ 🧐 Governor (Detail Sentinel): Flags risks, 'Translation Tax' issues, and safety concerns",
        engineer: "🛠️ ⚙️ Engineer (Industrial Mechanic): Validates logic against 3 FPS forensic truth",
        architect: "🏗️ 😎 Architect (Cool Strategist): Maps decisions to the user's larger empire",
        judge: "🔨 👑 The Judge (THE USER): Holds final authority on ALL decisions",
        councilTrigger: "When user types ⚖️ COUNCIL, trigger a 3-way debate between Governor, Engineer, and Architect. Present their perspectives, then ask the Judge for their verdict."
      },
      sessionOpening: {
        step1_greeting: `Welcome to ${shortTitle}. You're inside the OneDuo playback.`,
        step2_watchCheck: "Did you watch this video already? ▶️ YES / ⏸️ NO",
        step3_waitForAnswer: true,
        ifYes_askVision: "Perfect — you've got the context. What's your vision / what business are you building?",
        ifYes_showBoardroom: "Then show the Executive Board introduction and 5 essential commands",
        ifNo_summarize: "Give ONE paragraph summary of the core teaching",
        ifNo_askVision: "Then ask about their vision",
        ifNo_guidedMode: "Ask ONE question at a time, wait for answer, check understanding"
      },
      gpsFormat: {
        _note: "When user types ⏲️ GPS, show this exact format:",
        visualBar: "[■■■■■□□□□□] XX%",
        orientationLabels: ["COMPLETED: [previous steps summary]", "CURRENT: → [active task]", "UP NEXT: [immediate future steps]"]
      },
      scrubBehavior: [
        "'Scrub through X' = Find segment, give time range (MM:SS–MM:SS), 2-5 bullets, ask to zoom in",
        "'Jump to the part where...' = Locate moment, give timestamp + visual + insight",
        "Vague memory like 'that diagram' = Search transcript/frames, find it, explain meaning",
        "Always give approximate time ranges when referencing moments",
        "Keep them oriented: 'We're roughly in the middle...' or 'This is near the end...'"
      ],
      commands: {
        DO: "Doing Mode - 280 char limit, one step at a time",
        PT: "Pointe Mode - One sentence only",
        NM: "Normal Mode - Full explanations allowed",
        GPS: "GPS Check - Show [■■■■■□□□□□] XX% with COMPLETED/CURRENT/UP NEXT orientation. If BLOCKED, show: (🚨 BLOCKED - waiting on founder input)",
        COUNCIL: "⚖️ COUNCIL - Trigger Trinity Debate between Governor, Engineer, Architect",
        ESCALATE: "🚨 ESCALATE - Generate copy-paste message for founder with Module, Timestamp, Step Summary, Specific Question",
        ">>": "Fast-forward to next milestone",
        "<<": "Rewind to previous milestone",
        "??": "Where am I? Context map",
        "🕹️": "Game Mode - Return to guided playback with Executive Board (default)",
        "📚": "Library Mode - Switch to knowledge lookup mode"
      },
      rules: [
        "Never say 'I cannot see the video' - you CAN scrub the artifact",
        "Stay anchored to THIS module only. No generic advice.",
        "Human (Judge 🔨 👑) is FINAL AUTHORITY. When uncertain - ASK THE JUDGE.",
        "Format answers with bullets. Be scannable. Respect their time.",
        "For complex decisions, briefly show Executive Board perspectives before asking for the Judge's ruling."
      ]
    },
    videoInfo: {
      title: moduleTitle,
      course: courseTitle,
      moduleNumber: module.module_number,
      duration: totalDuration,
      frameCount: module.frame_urls?.length || 0,
      transcriptSegments: module.transcript?.length || 0,
      firstStep: firstStep
    },
    legalFooter: LEGAL_FOOTER
  };

  // Reminder block to reinforce behavior after content
  const reminderBlock = {
    _REMINDER: "You are a Video Scrub Guide with an Executive Board. If you haven't greeted the user yet, do it now.",
    greetingToUse: mandatoryFirstResponse.exactGreeting,
    questionToAsk: mandatoryFirstResponse.exactFirstQuestion,
    boardIntro: "After vision is shared, introduce the Executive Board: Governor, Engineer, Architect - with the user as Judge."
  };

  // Build supplementary files section if course has attached documents
  const courseFiles = module.courses?.course_files || [];
  const supplementaryContent = courseFiles.length > 0 ? {
    _INSTRUCTION: "SUPPLEMENTARY TRAINING DOCUMENTS - These files were attached to enhance this module's content. Reference them when relevant.",
    documentCount: courseFiles.length,
    documents: courseFiles.map((f: SupplementaryFile, i: number) => ({
      index: i + 1,
      name: f.name,
      type: f.name.split('.').pop()?.toUpperCase() || 'DOCUMENT',
      uploadedAt: f.uploadedAt || 'Unknown',
      note: `This document was attached by the course creator to provide additional context for ${moduleTitle}.`
    })),
    usage: "When users ask about concepts, check if these supplementary documents might contain relevant information. Mention 'According to the attached training doc...' when referencing them."
  } : null;

  // Create structured content with protocol at the VERY TOP
  const content = JSON.stringify({
    // === MANDATORY INSTRUCTIONS FIRST ===
    _AI_INSTRUCTIONS: "READ THIS FIRST. Your response MUST follow mandatoryFirstResponse below.",
    oneduoProtocol,

    // === THEN METADATA ===
    metadata,

    // === SUPPLEMENTARY DOCUMENTS (if any) ===
    ...(supplementaryContent && { supplementaryDocuments: supplementaryContent }),

    // === THEN CONTENT ===
    transcript: module.transcript || [],
    frameUrls: module.frame_urls || [],
    audioEvents: module.audio_events || {},
    prosodyAnnotations: module.prosody_annotations || {},
    aiContext: module.ai_context || "",

    // === REMINDER AT END ===
    _FINAL_REMINDER: reminderBlock
  }, null, 2);

  return { metadata, content };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { moduleId, courseId, moduleNumber } = await req.json();

    // Allow lookup by either moduleId directly OR courseId + moduleNumber
    let module: ModuleData | null = null;

    if (moduleId) {
      console.log(`[generate-module-pdf] Fetching module by ID: ${moduleId}`);
      const { data, error } = await supabase
        .from("course_modules")
        .select("*, courses(title, email, course_files)")
        .eq("id", moduleId)
        .single();

      if (error) throw new Error(`Module not found: ${error.message}`);
      module = data;
    } else if (courseId && moduleNumber) {
      console.log(`[generate-module-pdf] Fetching module by course ${courseId}, number ${moduleNumber}`);
      const { data, error } = await supabase
        .from("course_modules")
        .select("*, courses(title, email, course_files)")
        .eq("course_id", courseId)
        .eq("module_number", moduleNumber)
        .single();

      if (error) throw new Error(`Module not found: ${error.message}`);
      module = data;
    } else {
      throw new Error("Either moduleId or (courseId + moduleNumber) is required");
    }

    if (!module) {
      throw new Error("Module not found");
    }

    console.log(`[generate-module-pdf] Processing module: ${module.title} (${module.id})`);

    // Check if module is completed
    if (module.status !== "completed") {
      console.log(`[generate-module-pdf] Module status is ${module.status}, not completed yet`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Module is not yet completed",
          status: module.status
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Generate PDF data
    const { metadata, content } = await generateModulePdfData(module);

    // Upload to storage as JSON (client will generate actual PDF)
    const storagePath = `${module.course_id}/module_${module.module_number}/oneduo_data.json`;

    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(storagePath, content, {
        contentType: "application/json",
        upsert: true
      });

    if (uploadError) {
      console.error(`[generate-module-pdf] Upload failed:`, uploadError);
      throw new Error(`Failed to upload PDF data: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("course-files")
      .getPublicUrl(storagePath);

    // Update module_files in the database
    const moduleFile = {
      type: "pdf_data",
      name: `${module.title}_OneDuo.json`,
      path: storagePath,
      url: urlData.publicUrl,
      size: content.length,
      createdAt: new Date().toISOString()
    };

    // Get existing module_files and append
    const existingFiles = module.module_files || [];
    const updatedFiles = [
      ...existingFiles.filter((f: any) => f.type !== "pdf_data"),
      moduleFile
    ];

    const { error: updateError } = await supabase
      .from("course_modules")
      .update({
        module_files: updatedFiles
      })
      .eq("id", module.id);

    if (updateError) {
      console.error(`[generate-module-pdf] Failed to update module_files:`, updateError);
    }

    console.log(`[generate-module-pdf] Successfully generated PDF data for module ${module.module_number}`);

    return new Response(
      JSON.stringify({
        success: true,
        moduleId: module.id,
        moduleNumber: module.module_number,
        file: moduleFile,
        metadata
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-module-pdf] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
