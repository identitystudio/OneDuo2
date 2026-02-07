import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hash API key for secure storage/lookup
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Estimate cost based on video duration (placeholder logic)
function estimateCost(durationSeconds: number): number {
  // $0.10 per minute, minimum $0.50
  const costPerMinute = 10; // cents
  const durationMinutes = Math.ceil(durationSeconds / 60);
  return Math.max(50, durationMinutes * costPerMinute);
}

// Estimate completion time
function estimateCompletionTime(durationSeconds: number): Date {
  // Rough estimate: 2 minutes base + 0.5x video duration
  const processingMinutes = 2 + Math.ceil(durationSeconds / 120);
  const completionTime = new Date();
  completionTime.setMinutes(completionTime.getMinutes() + processingMinutes);
  return completionTime;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/api-transform', '');

    // Extract API key from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        error: 'Missing or invalid Authorization header',
        message: 'Use Bearer <api_key> format'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const keyHash = await hashApiKey(apiKey);

    // Validate API key
    const { data: keyData, error: keyError } = await supabase
      .rpc('validate_api_key', { p_key_hash: keyHash });

    if (keyError || !keyData || keyData.length === 0) {
      console.error('[API] Invalid API key:', keyError);
      return new Response(JSON.stringify({ 
        error: 'Invalid API key',
        message: 'The provided API key is not valid or has been revoked'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const keyInfo = keyData[0];
    if (!keyInfo.is_active) {
      return new Response(JSON.stringify({ 
        error: 'API key inactive',
        message: 'This API key has been deactivated'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check rate limit
    const { data: rateLimitData, error: rateLimitError } = await supabase
      .rpc('check_api_rate_limit', { p_api_key_id: keyInfo.key_id });

    if (rateLimitError) {
      console.error('[API] Rate limit check failed:', rateLimitError);
    }

    const rateLimit = rateLimitData?.[0];
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(rateLimit?.limit_value || 100),
      'X-RateLimit-Remaining': String(Math.max(0, (rateLimit?.limit_value || 100) - (rateLimit?.requests_used || 0) - 1)),
      'X-RateLimit-Reset': rateLimit?.reset_at || new Date(Date.now() + 3600000).toISOString(),
    };

    if (rateLimit && !rateLimit.allowed) {
      await supabase.rpc('log_api_usage', {
        p_api_key_id: keyInfo.key_id,
        p_job_id: null,
        p_endpoint: path || '/transform',
        p_response_status: 429
      });

      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        message: `Rate limit of ${rateLimit.limit_value} requests per hour exceeded`,
        reset_at: rateLimit.reset_at
      }), {
        status: 429,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route handling
    if (path === '/status' || path === '/v1/status') {
      return await handleStatus(req, supabase, keyInfo, rateLimitHeaders);
    } else if (path === '' || path === '/' || path === '/v1/transform') {
      return await handleTransform(req, supabase, keyInfo, rateLimitHeaders);
    } else {
      return new Response(JSON.stringify({ 
        error: 'Not found',
        message: `Unknown endpoint: ${path}`,
        available_endpoints: ['/v1/transform', '/v1/status']
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Handle POST /v1/transform
async function handleTransform(
  req: Request, 
  supabase: any, 
  keyInfo: any,
  rateLimitHeaders: Record<string, string>
) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ 
      error: 'Method not allowed',
      message: 'Use POST method'
    }), {
      status: 405,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: 'Invalid JSON',
      message: 'Request body must be valid JSON'
    }), {
      status: 400,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { video_url, callback_url, metadata } = body;

  // Validate required fields
  if (!video_url) {
    return new Response(JSON.stringify({ 
      error: 'Missing required field',
      message: 'video_url is required'
    }), {
      status: 400,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Validate URL format
  try {
    new URL(video_url);
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: 'Invalid video_url',
      message: 'video_url must be a valid URL'
    }), {
      status: 400,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Validate callback_url if provided
  if (callback_url) {
    try {
      new URL(callback_url);
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: 'Invalid callback_url',
        message: 'callback_url must be a valid URL'
      }), {
        status: 400,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  console.log(`[API] Transform request from key ${keyInfo.key_name}: ${video_url}`);

  // Extract filename from URL
  const urlPath = new URL(video_url).pathname;
  const filename = urlPath.split('/').pop() || 'api-upload';
  const title = filename.replace(/\.[^.]+$/, '');

  // Get user email for course creation
  const { data: userData } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', keyInfo.user_id)
    .single();

  // Fallback to auth.users if no profile
  let userEmail = userData?.email;
  if (!userEmail) {
    const { data: authUser } = await supabase.auth.admin.getUserById(keyInfo.user_id);
    userEmail = authUser?.user?.email || 'api@oneduo.ai';
  }

  // Create course entry
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({
      title,
      email: userEmail,
      user_id: keyInfo.user_id,
      video_url,
      video_filename: filename,
      status: 'queued',
      progress: 0,
      progress_step: 'queued',
      density_mode: 'standard',
      fps_target: 1
    })
    .select()
    .single();

  if (courseError) {
    console.error('[API] Failed to create course:', courseError);
    return new Response(JSON.stringify({ 
      error: 'Failed to create job',
      message: courseError.message
    }), {
      status: 500,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Create API job entry
  const { data: apiJob, error: apiJobError } = await supabase
    .from('api_jobs')
    .insert({
      api_key_id: keyInfo.key_id,
      course_id: course.id,
      video_url,
      callback_url,
      client_metadata: metadata || {},
      status: 'queued'
    })
    .select()
    .single();

  if (apiJobError) {
    console.error('[API] Failed to create API job:', apiJobError);
  }

  // Queue for processing
  const { error: queueError } = await supabase
    .from('processing_queue')
    .insert({
      course_id: course.id,
      step: 'transcribe',
      status: 'pending',
      metadata: { source: 'api', api_job_id: apiJob?.id }
    });

  if (queueError) {
    console.error('[API] Failed to queue job:', queueError);
  }

  // Log API usage
  await supabase.rpc('log_api_usage', {
    p_api_key_id: keyInfo.key_id,
    p_job_id: course.id,
    p_endpoint: '/v1/transform',
    p_metadata: { video_url, callback_url: callback_url || null },
    p_response_status: 202
  });

  // Estimate completion time (assume 5 min video as default)
  const estimatedDuration = 300; // 5 minutes default
  const estimatedCompletion = estimateCompletionTime(estimatedDuration);
  const costEstimate = estimateCost(estimatedDuration);

  return new Response(JSON.stringify({
    job_id: course.id,
    status: 'queued',
    estimated_completion: estimatedCompletion.toISOString(),
    cost_estimate: `$${(costEstimate / 100).toFixed(2)}`,
    message: 'Video queued for processing',
    _links: {
      status: `/api/v1/status`,
      self: `/api/v1/transform`
    }
  }), {
    status: 202,
    headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
  });
}

// Handle POST /v1/status
async function handleStatus(
  req: Request, 
  supabase: any, 
  keyInfo: any,
  rateLimitHeaders: Record<string, string>
) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ 
      error: 'Method not allowed',
      message: 'Use POST method'
    }), {
      status: 405,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: 'Invalid JSON',
      message: 'Request body must be valid JSON'
    }), {
      status: 400,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { job_id } = body;

  if (!job_id) {
    return new Response(JSON.stringify({ 
      error: 'Missing required field',
      message: 'job_id is required'
    }), {
      status: 400,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Verify this job belongs to this API key
  const { data: apiJob, error: apiJobError } = await supabase
    .from('api_jobs')
    .select('*, courses(*)')
    .eq('course_id', job_id)
    .eq('api_key_id', keyInfo.key_id)
    .single();

  if (apiJobError || !apiJob) {
    // Try direct course lookup for backward compatibility
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', job_id)
      .eq('user_id', keyInfo.user_id)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ 
        error: 'Job not found',
        message: 'The specified job_id was not found or does not belong to this API key'
      }), {
        status: 404,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Return course status directly
    const response: any = {
      job_id: course.id,
      status: course.status,
      progress: course.progress || 0,
      progress_step: course.progress_step,
      title: course.title,
      created_at: course.created_at
    };

    if (course.status === 'completed') {
      response.artifact_url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-public-course?courseId=${course.id}`;
      response.completed_at = course.completed_at;
    }

    if (course.status === 'failed') {
      response.error = course.error_message;
    }

    // Log API usage
    await supabase.rpc('log_api_usage', {
      p_api_key_id: keyInfo.key_id,
      p_job_id: job_id,
      p_endpoint: '/v1/status',
      p_response_status: 200
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
    });
  }

  const course = apiJob.courses;

  // Build response
  const response: any = {
    job_id: course.id,
    status: course.status,
    progress: course.progress || 0,
    progress_step: course.progress_step,
    title: course.title,
    created_at: course.created_at,
    client_metadata: apiJob.client_metadata
  };

  if (course.status === 'completed') {
    response.artifact_url = apiJob.artifact_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-public-course?courseId=${course.id}`;
    response.pdf_url = apiJob.pdf_url;
    response.completed_at = course.completed_at;
    response.video_duration_seconds = course.video_duration_seconds;
    response.total_frames = course.total_frames;
  }

  if (course.status === 'failed') {
    response.error = course.error_message || apiJob.error_message;
  }

  // Log API usage
  await supabase.rpc('log_api_usage', {
    p_api_key_id: keyInfo.key_id,
    p_job_id: job_id,
    p_endpoint: '/v1/status',
    p_response_status: 200
  });

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' }
  });
}
