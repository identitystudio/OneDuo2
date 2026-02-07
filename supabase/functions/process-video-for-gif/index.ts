import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Replicate from "https://esm.sh/replicate@0.25.2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
};

type ResolveResult =
  | { ok: true; resolvedUrl: string; contentType: string }
  | { ok: false; error: string };

// ===========================================
// SSRF PROTECTION - URL VALIDATION
// ===========================================
const isPrivateIP = (hostname: string): boolean => {
  // Block localhost variations
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }
  
  // Block private IP ranges
  const privateRanges = [
    /^10\./,                          // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,                    // 192.168.0.0/16
    /^127\./,                         // 127.0.0.0/8 (loopback)
    /^169\.254\./,                    // 169.254.0.0/16 (link-local)
    /^0\./,                           // 0.0.0.0/8
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
    /^192\.0\.0\./,                   // 192.0.0.0/24 (IETF protocol assignments)
    /^192\.0\.2\./,                   // 192.0.2.0/24 (TEST-NET-1)
    /^198\.51\.100\./,                // 198.51.100.0/24 (TEST-NET-2)
    /^203\.0\.113\./,                 // 203.0.113.0/24 (TEST-NET-3)
    /^224\./,                         // 224.0.0.0/4 (multicast)
    /^240\./,                         // 240.0.0.0/4 (reserved)
  ];
  
  return privateRanges.some(range => range.test(hostname));
};

const validateUrl = (url: string): { valid: boolean; error?: string } => {
  try {
    const parsed = new URL(url);
    
    // Only allow HTTP/HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }
    
    // Block private IPs
    if (isPrivateIP(parsed.hostname)) {
      return { valid: false, error: 'Private/internal URLs are not allowed' };
    }
    
    // Block common internal hostnames
    const blockedHostnames = ['internal', 'intranet', 'corp', 'private', 'local'];
    if (blockedHostnames.some(blocked => parsed.hostname.includes(blocked))) {
      return { valid: false, error: 'Internal hostnames are not allowed' };
    }
    
    // Block metadata endpoints (AWS, GCP, Azure)
    const metadataEndpoints = [
      '169.254.169.254',  // AWS/GCP metadata
      'metadata.google.internal',
      'metadata.google',
      '169.254.170.2',    // AWS ECS metadata
    ];
    if (metadataEndpoints.some(endpoint => parsed.hostname.includes(endpoint))) {
      return { valid: false, error: 'Cloud metadata endpoints are not allowed' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
};

// ===========================================
// RATE LIMITING
// ===========================================
const checkRateLimit = async (sessionId: string, actionType: string): Promise<boolean> => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Rate limiting not configured - missing Supabase credentials');
    return true; // Allow if not configured
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_session_id: sessionId,
      p_action_type: actionType,
      p_max_requests: 50,
      p_window_minutes: 60
    });
    
    if (error) {
      console.error('Rate limit check error:', error);
      return true; // Allow on error
    }
    
    return data === true;
  } catch (err) {
    console.error('Rate limit check failed:', err);
    return true; // Allow on error
  }
};

const incrementRateLimit = async (sessionId: string, actionType: string): Promise<void> => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) return;
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.rpc('increment_rate_limit', {
      p_session_id: sessionId,
      p_action_type: actionType
    });
  } catch (err) {
    console.error('Failed to increment rate limit:', err);
  }
};

const extractGoogleDriveFileId = (url: string): string | null => {
  // /file/d/{id}
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return fileMatch[1];

  // open?id={id}
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {
    // ignore
  }

  // uc?export=download&id={id}
  const ucMatch = url.match(/drive\.google\.com\/uc\?.*\bid=([a-zA-Z0-9_-]+)/);
  if (ucMatch?.[1]) return ucMatch[1];

  // drive.usercontent.google.com/download?id={id}
  const userContentMatch = url.match(/drive\.usercontent\.google\.com\/download\?.*\bid=([a-zA-Z0-9_-]+)/);
  if (userContentMatch?.[1]) return userContentMatch[1];

  return null;
};

const candidateUrlsForInput = (inputUrl: string): string[] => {
  const trimmed = inputUrl.trim();

  // Dropbox: force direct download
  if (trimmed.includes("dropbox.com")) {
    const asDl1 = trimmed
      .replace(/[?&]dl=0/, "?dl=1")
      .replace(/\?dl=0$/, "?dl=1");
    return [asDl1, trimmed];
  }

  // Google Drive: try a few known direct-download endpoints
  const fileId = extractGoogleDriveFileId(trimmed);
  if (fileId) {
    return [
      // Newer endpoint (often works better for direct file serving)
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
      // Classic endpoint
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`,
      trimmed,
    ];
  }

  // Otherwise: as-is
  return [trimmed];
};

const probeUrlForVideo = async (url: string): Promise<{ ok: boolean; finalUrl: string; contentType: string; status: number } | { ok: false; status: number; contentType: string }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    // Range prevents downloading large files; we just need headers + a byte.
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Range: "bytes=0-0",
      },
      signal: controller.signal,
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const status = res.status;

    if (!(status === 200 || status === 206)) {
      return { ok: false, status, contentType };
    }

    return { ok: true, finalUrl: res.url, contentType, status };
  } catch (e) {
    console.log("probeUrlForVideo failed:", String(e));
    return { ok: false, status: 0, contentType: "" };
  } finally {
    clearTimeout(timeout);
  }
};

const resolveVideoUrl = async (inputUrl: string): Promise<ResolveResult> => {
  // SSRF Protection: Validate URL first
  const validation = validateUrl(inputUrl);
  if (!validation.valid) {
    return { ok: false, error: validation.error! };
  }
  
  const candidates = candidateUrlsForInput(inputUrl);

  console.log("Resolving video URL", { inputUrl, candidates: candidates.slice(0, 4) });

  for (const candidate of candidates) {
    // Validate each candidate URL too
    const candidateValidation = validateUrl(candidate);
    if (!candidateValidation.valid) {
      console.log("Candidate URL blocked by SSRF protection:", candidate);
      continue;
    }
    
    const probe = await probeUrlForVideo(candidate);

    if (!probe.ok) {
      console.log("Probe failed", { candidate, status: probe.status, contentType: probe.contentType });
      continue;
    }

    // Reject obvious HTML landing pages (common for Google Drive permission/confirm pages)
    if (probe.contentType.includes("text/html")) {
      console.log("Probe returned HTML, skipping", { candidate, finalUrl: probe.finalUrl });
      continue;
    }

    // Accept typical video responses
    const looksLikeVideo = probe.contentType.startsWith("video/") || probe.contentType.includes("application/octet-stream");
    if (!looksLikeVideo) {
      console.log("Probe content-type not recognized as video, skipping", { candidate, contentType: probe.contentType });
      continue;
    }

    return { ok: true, resolvedUrl: probe.finalUrl, contentType: probe.contentType };
  }

  // Friendly, actionable message for the most common failure
  if (inputUrl.includes("drive.google.com") || inputUrl.includes("drive.usercontent.google.com")) {
    return {
      ok: false,
      error:
        "This Google Drive link is returning an HTML page instead of the video file. Make the file shared as 'Anyone with the link', and use a direct download link (not a preview link). If Drive still shows a 'can't scan for viruses'/confirm download page, please use Dropbox or another direct MP4 host instead.",
    };
  }

  return {
    ok: false,
    error:
      "That URL doesn't appear to be a direct video file link. Please use a direct MP4/MOV link, or a share link from Dropbox/Google Drive that downloads the file directly.",
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, videoUrl, predictionId, transcriptId } = body
    
    // Get session ID from header for rate limiting
    const sessionId = req.headers.get('x-session-id') || 'anonymous';

    // Action: analyze - Return estimates before processing
    if (action === 'analyze') {
      const { videoDurationSeconds } = body

      // 1 frame every 1 second (captures fast cuts)
      const totalFrames = Math.ceil(videoDurationSeconds)

      // Estimate ~35KB per optimized GIF frame at 480px width
      const estimatedSizePerFrame = 35 * 1024 // 35KB
      const estimatedTotalSize = totalFrames * estimatedSizePerFrame
      const targetSizePerGif = 15 * 1024 * 1024 // 15MB target (under 20MB limit)

      const framesPerGif = Math.floor(targetSizePerGif / estimatedSizePerFrame)
      const numberOfGifs = Math.ceil(totalFrames / framesPerGif)

      // Estimate processing time: ~1 second per frame for extraction + transcription
      const estimatedProcessingMinutes = Math.ceil((totalFrames * 1.5 + 60) / 60)

      return new Response(JSON.stringify({
        totalFrames,
        framesPerGif,
        numberOfGifs,
        estimatedTotalSizeMB: Math.round(estimatedTotalSize / (1024 * 1024)),
        estimatedProcessingMinutes,
        frameInterval: 1, // seconds between frames
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Action: resolve-video-url - Convert/verify share links into a direct video URL
    if (action === 'resolve-video-url') {
      const input = typeof videoUrl === 'string' ? videoUrl : ''

      if (!input.trim()) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing videoUrl' } satisfies ResolveResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const result = await resolveVideoUrl(input)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Action: transcribe - Start AssemblyAI transcription (async, returns transcript ID)
    if (action === 'transcribe') {
      // Rate limiting for expensive operations
      const allowed = await checkRateLimit(sessionId, 'transcribe');
      if (!allowed) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please wait before making more requests.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const ASSEMBLYAI_API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY')
      if (!ASSEMBLYAI_API_KEY) {
        throw new Error('ASSEMBLYAI_API_KEY not configured')
      }

      // Validate URL before sending to external service
      if (videoUrl) {
        const validation = validateUrl(videoUrl);
        if (!validation.valid) {
          return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      console.log("Starting AssemblyAI transcription for:", videoUrl)

      // Submit transcription job to AssemblyAI - it accepts video URLs directly
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'Authorization': ASSEMBLYAI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: videoUrl, // AssemblyAI accepts video URLs directly
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('AssemblyAI submit error:', errorText)
        throw new Error('Failed to start transcription')
      }

      const result = await response.json()
      console.log("AssemblyAI transcription started, ID:", result.id)
      
      // Increment rate limit after successful request
      await incrementRateLimit(sessionId, 'transcribe');

      return new Response(JSON.stringify({
        transcriptId: result.id,
        status: result.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Action: check-transcription - Poll AssemblyAI transcription status
    if (action === 'check-transcription') {
      const ASSEMBLYAI_API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY')
      if (!ASSEMBLYAI_API_KEY) {
        throw new Error('ASSEMBLYAI_API_KEY not configured')
      }

      console.log("Checking transcription status for:", transcriptId)

      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': ASSEMBLYAI_API_KEY,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('AssemblyAI status check error:', errorText)
        throw new Error('Failed to check transcription status')
      }

      const result = await response.json()
      console.log("Transcription status:", result.status)

      // Map AssemblyAI response to our format
      if (result.status === 'completed') {
        // Convert AssemblyAI words to segments (group by sentences/punctuation)
        const segments = []
        if (result.words && result.words.length > 0) {
          let currentSegment = { start: result.words[0].start / 1000, end: 0, text: '' }

          for (const word of result.words) {
            currentSegment.text += (currentSegment.text ? ' ' : '') + word.text
            currentSegment.end = word.end / 1000

            // Split on punctuation or every ~10 words
            if (word.text.match(/[.!?]$/) || currentSegment.text.split(' ').length >= 10) {
              segments.push({ ...currentSegment, text: currentSegment.text.trim() })
              if (result.words.indexOf(word) < result.words.length - 1) {
                const nextWord = result.words[result.words.indexOf(word) + 1]
                currentSegment = { start: nextWord.start / 1000, end: 0, text: '' }
              }
            }
          }

          // Push remaining text
          if (currentSegment.text.trim()) {
            segments.push({ ...currentSegment, text: currentSegment.text.trim() })
          }
        }

        return new Response(JSON.stringify({
          status: 'completed',
          text: result.text || '',
          segments,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } else if (result.status === 'error') {
        return new Response(JSON.stringify({
          status: 'error',
          error: result.error || 'Transcription failed',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } else {
        // Still processing (queued or processing)
        return new Response(JSON.stringify({
          status: result.status, // 'queued' or 'processing'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Action: extract-frames - Start frame extraction via Replicate
    if (action === 'extract-frames') {
      // Rate limiting for expensive operations
      const allowed = await checkRateLimit(sessionId, 'extract-frames');
      if (!allowed) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please wait before making more requests.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY')
      if (!REPLICATE_API_KEY) {
        throw new Error('REPLICATE_API_KEY not configured')
      }

      // Validate URL before sending to external service
      if (videoUrl) {
        const validation = validateUrl(videoUrl);
        if (!validation.valid) {
          return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const replicate = new Replicate({ auth: REPLICATE_API_KEY })
      const { videoDurationSeconds, startTime = 0, endTime } = body

      const actualEndTime = endTime || videoDurationSeconds
      const segmentDuration = actualEndTime - startTime

      console.log("Extracting frames:", { videoUrl, startTime, endTime: actualEndTime, segmentDuration })

      // Use onemadgeek/video-to-frames-extractor model
      const prediction = await replicate.predictions.create({
        version: "1426d3be8f7a852a4695fda6e092cd4caf13c2d766385bfc67ae7efaa1e82c6a",
        input: {
          video: videoUrl,
          fps: 1, // 1 frame per second
        }
      })

      console.log("Frame extraction started:", prediction.id)
      
      // Increment rate limit after successful request
      await incrementRateLimit(sessionId, 'extract-frames');

      return new Response(JSON.stringify({
        predictionId: prediction.id,
        status: prediction.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Action: check-status - Poll prediction status
    if (action === 'check-status') {
      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY')
      if (!REPLICATE_API_KEY) {
        throw new Error('REPLICATE_API_KEY not configured')
      }

      const replicate = new Replicate({ auth: REPLICATE_API_KEY })
      const prediction = await replicate.predictions.get(predictionId)

      console.log("Prediction status:", prediction.status)

      return new Response(JSON.stringify({
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("Error in process-video-for-gif:", error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
