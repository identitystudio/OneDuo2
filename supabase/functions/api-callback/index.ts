import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function is called internally when a course completes processing
// It sends webhooks to any API jobs that have a callback_url
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { courseId, status } = await req.json();

    if (!courseId) {
      return new Response(JSON.stringify({ error: 'courseId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[API Callback] Processing callback for course ${courseId}, status: ${status}`);

    // Find API job for this course
    const { data: apiJob, error: jobError } = await supabase
      .from('api_jobs')
      .select('*, courses(*)')
      .eq('course_id', courseId)
      .single();

    if (jobError || !apiJob) {
      console.log(`[API Callback] No API job found for course ${courseId}`);
      return new Response(JSON.stringify({ 
        message: 'No API job found for this course',
        courseId 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if callback already sent
    if (apiJob.callback_sent_at) {
      console.log(`[API Callback] Callback already sent for job ${apiJob.id}`);
      return new Response(JSON.stringify({ 
        message: 'Callback already sent',
        sent_at: apiJob.callback_sent_at 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if callback_url is configured
    if (!apiJob.callback_url) {
      console.log(`[API Callback] No callback URL configured for job ${apiJob.id}`);
      
      // Update job status
      await supabase
        .from('api_jobs')
        .update({ 
          status: status || 'completed',
          artifact_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-public-course?courseId=${courseId}`
        })
        .eq('id', apiJob.id);

      return new Response(JSON.stringify({ 
        message: 'No callback URL configured' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const course = apiJob.courses;

    // Build callback payload
    const callbackPayload: any = {
      job_id: courseId,
      status: status || course.status,
      title: course.title,
      video_duration_seconds: course.video_duration_seconds,
      total_frames: course.total_frames,
      client_metadata: apiJob.client_metadata,
      timestamp: new Date().toISOString()
    };

    if (status === 'completed' || course.status === 'completed') {
      callbackPayload.artifact_url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-public-course?courseId=${courseId}`;
      callbackPayload.completed_at = course.completed_at;
      
      // Include transcript summary if available
      if (course.transcript && Array.isArray(course.transcript)) {
        callbackPayload.transcript_segments = course.transcript.length;
      }
      
      // Include frame count
      if (course.frame_urls && Array.isArray(course.frame_urls)) {
        callbackPayload.frame_count = course.frame_urls.length;
      }
    }

    if (status === 'failed' || course.status === 'failed') {
      callbackPayload.error = course.error_message;
    }

    console.log(`[API Callback] Sending webhook to ${apiJob.callback_url}`);

    // Send webhook
    let callbackStatus = 0;
    let callbackError: string | null = null;

    try {
      const response = await fetch(apiJob.callback_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OneDuo-Webhook/1.0',
          'X-OneDuo-Event': 'job.completed',
          'X-OneDuo-Job-Id': courseId
        },
        body: JSON.stringify(callbackPayload)
      });

      callbackStatus = response.status;
      
      if (!response.ok) {
        callbackError = `HTTP ${response.status}: ${await response.text().catch(() => 'Unknown error')}`;
        console.error(`[API Callback] Webhook failed:`, callbackError);
      } else {
        console.log(`[API Callback] Webhook sent successfully, status: ${callbackStatus}`);
      }
    } catch (fetchError) {
      callbackError = fetchError instanceof Error ? fetchError.message : 'Network error';
      console.error(`[API Callback] Webhook fetch error:`, callbackError);
    }

    // Update API job with callback result
    await supabase
      .from('api_jobs')
      .update({
        status: status || course.status,
        artifact_url: callbackPayload.artifact_url,
        callback_sent_at: new Date().toISOString(),
        callback_response_status: callbackStatus,
        error_message: callbackError,
        updated_at: new Date().toISOString()
      })
      .eq('id', apiJob.id);

    return new Response(JSON.stringify({
      success: callbackStatus >= 200 && callbackStatus < 300,
      callback_url: apiJob.callback_url,
      response_status: callbackStatus,
      error: callbackError
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[API Callback] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
