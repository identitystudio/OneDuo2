import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
};

// Simple in-memory rate limiting (per instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 30; // Max requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  if (!record || now > record.resetTime) {
    // New window
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  
  if (record.count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: record.resetTime - now };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_REQUESTS - record.count, resetIn: record.resetTime - now };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client identifier for rate limiting (IP or session)
    const sessionId = req.headers.get('x-session-id') || 'anonymous';
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
    const rateLimitKey = `${clientIp}:${sessionId}`;
    
    // Check rate limit
    const rateCheck = checkRateLimit(rateLimitKey);
    
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil(rateCheck.resetIn / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(rateCheck.resetIn / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateCheck.resetIn / 1000))
          } 
        }
      );
    }

    const { courseId } = await req.json();

    if (!courseId) {
      return new Response(
        JSON.stringify({ error: 'Course ID is required' }),
        { 
          status: 400, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateCheck.remaining)
          } 
        }
      );
    }

    // Validate courseId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(courseId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid course ID format' }),
        { 
          status: 400, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateCheck.remaining)
          } 
        }
      );
    }

    console.log('Fetching public course data for:', courseId);

    // Create Supabase client with service role for public access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch course data
    const { data: course, error } = await supabase
      .from('courses')
      .select('id, title, video_duration_seconds, frame_urls, transcript, created_at, status')
      .eq('id', courseId)
      .single();

    if (error) {
      console.error('Error fetching course:', error);
      return new Response(
        JSON.stringify({ error: 'Course not found' }),
        { 
          status: 404, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateCheck.remaining)
          } 
        }
      );
    }

    // Only return completed courses
    if (course.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Course is still processing' }),
        { 
          status: 400, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateCheck.remaining)
          } 
        }
      );
    }

    // Helper: sample frames evenly across the array to represent full video duration
    const sampleFramesEvenly = (frames: string[], maxFrames: number): string[] => {
      if (!Array.isArray(frames) || frames.length <= maxFrames) return frames || [];
      const step = frames.length / maxFrames;
      const sampled: string[] = [];
      for (let i = 0; i < maxFrames; i++) {
        const idx = Math.floor(i * step);
        sampled.push(frames[idx]);
      }
      return sampled;
    };

    // Limit frame URLs to prevent massive JSON responses (PDF exporter only uses ~100 max)
    // Use even sampling to represent the ENTIRE video, not just the beginning
    const MAX_FRAME_URLS = 300;
    const allFrameUrls = course.frame_urls || [];
    const totalFrameCount = allFrameUrls.length;
    const limitedFrameUrls = sampleFramesEvenly(allFrameUrls, MAX_FRAME_URLS);

    console.log(`Course found: ${course.title} with ${totalFrameCount} total frames -> ${limitedFrameUrls.length} sampled evenly`);

    return new Response(
      JSON.stringify({ 
        course: {
          id: course.id,
          title: course.title,
          video_duration_seconds: course.video_duration_seconds,
          frame_urls: limitedFrameUrls,
          total_frame_count: totalFrameCount,
          transcript: course.transcript,
          created_at: course.created_at
        }
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateCheck.remaining)
        } 
      }
    );

  } catch (error) {
    console.error('Error in get-public-course:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});