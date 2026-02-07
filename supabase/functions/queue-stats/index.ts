/**
 * Queue Stats API
 * Returns queue statistics and job logs for the admin dashboard
 * Protected by admin email check
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAILS = ['christinaxcabral@gmail.com']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Authenticate the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - no auth header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - not an admin' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { action, jobId } = body

    // Fetch logs for a specific job
    if (action === 'job-logs' && jobId) {
      const { data: logs, error } = await supabase
        .from('job_logs')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      return new Response(
        JSON.stringify({ logs: logs || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Default: fetch queue stats
    // Get all jobs for stats
    const { data: allJobs, error: jobsError } = await supabase
      .from('video_processing_queue')
      .select('status')

    if (jobsError) throw jobsError

    const stats = {
      queued: allJobs?.filter(j => j.status === 'queued').length || 0,
      processing: allJobs?.filter(j => j.status === 'processing').length || 0,
      completed: allJobs?.filter(j => j.status === 'completed').length || 0,
      failed: allJobs?.filter(j => j.status === 'failed').length || 0,
      total: allJobs?.length || 0
    }

    // Get recent jobs (last 50)
    const { data: recentJobs, error: recentError } = await supabase
      .from('video_processing_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (recentError) throw recentError

    // Get recent logs (last 100)
    const { data: recentLogs, error: logsError } = await supabase
      .from('job_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (logsError) throw logsError

    return new Response(
      JSON.stringify({
        stats,
        recentJobs: recentJobs || [],
        recentLogs: recentLogs || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[queue-stats] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
