/**
 * Enqueue Video Job
 * Adds a video to the processing queue
 * Called after successful upload
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EnqueueRequest {
  videoPath: string
  jobId?: string
  userId?: string
  courseId?: string
  moduleId?: string
  metadata?: Record<string, unknown>
  triggerWorker?: boolean // Whether to immediately trigger a worker
}

// Declare EdgeRuntime for Deno
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body: EnqueueRequest = await req.json()
    
    if (!body.videoPath) {
      return new Response(JSON.stringify({
        success: false,
        error: 'videoPath is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate job ID if not provided
    const jobId = body.jobId || `job-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    
    console.log(`[EnqueueVideo] Enqueueing job ${jobId} for path: ${body.videoPath}`)

    // Enqueue the job using direct insert (simpler than RPC for this case)
    const { data: insertData, error: enqueueError } = await supabase
      .from('video_processing_queue')
      .insert({
        video_path: body.videoPath,
        job_id: jobId,
        user_id: body.userId || null,
        metadata: {
          courseId: body.courseId,
          moduleId: body.moduleId,
          enqueuedAt: new Date().toISOString(),
          ...body.metadata
        }
      })
      .select('id')
      .single()

    if (enqueueError) {
      // Check if it's a duplicate (job already exists)
      if (enqueueError.code === '23505') {
        console.log(`[EnqueueVideo] Job ${jobId} already exists, skipping`)
        return new Response(JSON.stringify({
          success: true,
          jobId,
          message: 'Job already queued'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      console.error('[EnqueueVideo] Failed to enqueue:', enqueueError)
      throw enqueueError
    }

    console.log(`[EnqueueVideo] Job ${jobId} enqueued with ID: ${insertData?.id}`)

    // Log job_enqueued event to job_logs
    try {
      await supabase.from('job_logs').insert({
        job_id: jobId,
        step: 'job_enqueued',
        level: 'info',
        message: 'Job inserted into video_processing_queue',
        metadata: {
          video_path: body.videoPath,
          file_size: body.metadata?.fileSize || null,
          queue_id: insertData?.id,
          course_id: body.courseId || null,
          module_id: body.moduleId || null,
          timestamp: new Date().toISOString()
        }
      })
      console.log(`[EnqueueVideo] Logged job_enqueued event for ${jobId}`)
    } catch (logError) {
      console.warn('[EnqueueVideo] Failed to log job_enqueued:', logError)
    }

    // Optionally trigger a worker immediately (fire and forget)
    if (body.triggerWorker !== false) {
      // Use EdgeRuntime.waitUntil for background execution
      try {
        EdgeRuntime.waitUntil(
          supabase.functions.invoke('video-queue-worker', {
            body: { maxJobs: 1 }
          }).catch(err => {
            console.warn('[EnqueueVideo] Worker trigger failed (non-blocking):', err)
          })
        )
      } catch (e) {
        // EdgeRuntime may not be available in all environments
        console.warn('[EnqueueVideo] EdgeRuntime not available, worker not triggered')
      }
    }

    // Get current queue status
    const { data: stats } = await supabase
      .from('video_processing_queue')
      .select('status')
      
    const queueStats = {
      queued: stats?.filter(s => s.status === 'queued').length || 0,
      processing: stats?.filter(s => s.status === 'processing').length || 0,
    }

    return new Response(JSON.stringify({
      success: true,
      jobId,
      queueId: insertData?.id,
      position: queueStats.queued,
      message: `Job ${jobId} enqueued successfully`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[EnqueueVideo] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to enqueue job'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
