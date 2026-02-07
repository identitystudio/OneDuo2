import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Extended to support get-course-stats action for download badges

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Admin Download Analytics Edge Function
 * 
 * Returns comprehensive download analytics for the admin dashboard:
 * - Total downloads, unique users
 * - Downloads by source (email, dashboard, direct)
 * - Potential abuse detection
 * - Recent activity log
 * - Daily trends
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for action-specific requests
    let body: { courseId?: string; action?: string; email?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON - that's fine for admin requests
    }

    // Handle user-specific course stats request (for download badges - no admin required)
    if (body.action === 'get-course-stats' && body.courseId) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify user owns this course
      const { data: course } = await supabase
        .from('courses')
        .select('id, email')
        .eq('id', body.courseId)
        .single();

      if (!course || course.email !== user.email) {
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get download count
      const { count: downloads } = await supabase
        .from('artifact_access_log')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', body.courseId)
        .eq('access_type', 'download');

      // Get view count (url_generated or view)
      const { count: views } = await supabase
        .from('artifact_access_log')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', body.courseId)
        .in('access_type', ['view', 'url_generated']);

      // Get link generation count
      const { count: linkGenerations } = await supabase
        .from('artifact_access_log')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', body.courseId)
        .in('access_type', ['resend_link', 'share_link']);

      console.log('[admin-download-analytics] Returning course stats for:', body.courseId);
      
      return new Response(
        JSON.stringify({ 
          downloads: downloads || 0, 
          views: views || 0,
          linkGenerations: linkGenerations || 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle user-specific course history request (no admin required)
    if (body.action === 'get-course-history' && body.courseId) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify user owns this course
      const { data: course } = await supabase
        .from('courses')
        .select('id, email')
        .eq('id', body.courseId)
        .single();

      if (!course || course.email !== user.email) {
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get access history for this course
      const { data: logs } = await supabase
        .from('artifact_access_log')
        .select('id, access_type, accessed_at, download_completed, download_source')
        .eq('course_id', body.courseId)
        .order('accessed_at', { ascending: false })
        .limit(20);

      console.log('[admin-download-analytics] Returning course history for:', body.courseId);
      
      return new Response(
        JSON.stringify({ logs: logs || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin-only requests below
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin access (simple email-based)
    const adminEmails = ['christinaxcabral@gmail.com'];
    if (!adminEmails.includes(user.email || '')) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[admin-download-analytics] Fetching analytics for admin:', user.email);

    // Get total downloads count
    const { count: totalDownloads } = await supabase
      .from('artifact_access_log')
      .select('*', { count: 'exact', head: true })
      .eq('access_type', 'download');

    // Get unique users (by accessor_hash)
    const { data: uniqueUsersData } = await supabase
      .from('artifact_access_log')
      .select('accessor_hash')
      .eq('access_type', 'download')
      .not('accessor_hash', 'is', null);
    
    const uniqueUsers = new Set(uniqueUsersData?.map(u => u.accessor_hash) || []).size;

    // Get downloads by source
    const { count: emailClicks } = await supabase
      .from('artifact_access_log')
      .select('*', { count: 'exact', head: true })
      .eq('download_source', 'email');

    const { count: dashboardAccess } = await supabase
      .from('artifact_access_log')
      .select('*', { count: 'exact', head: true })
      .eq('download_source', 'dashboard');

    const { count: directAccess } = await supabase
      .from('artifact_access_log')
      .select('*', { count: 'exact', head: true })
      .eq('download_source', 'direct');

    // Detect potential abuse (more than 20 downloads from same IP in last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: abuseData } = await supabase
      .from('artifact_access_log')
      .select('course_id, ip_address, accessed_at')
      .eq('access_type', 'download')
      .gte('accessed_at', oneDayAgo)
      .order('accessed_at', { ascending: false });

    // Group by IP to find potential abuse
    const ipCounts: Record<string, { 
      course_id: string; 
      count: number; 
      first_access: string; 
      last_access: string 
    }> = {};
    
    for (const row of (abuseData || [])) {
      const key = `${row.ip_address}-${row.course_id}`;
      if (!ipCounts[key]) {
        ipCounts[key] = { 
          course_id: row.course_id, 
          count: 0, 
          first_access: row.accessed_at,
          last_access: row.accessed_at 
        };
      }
      ipCounts[key].count++;
      if (row.accessed_at < ipCounts[key].first_access) {
        ipCounts[key].first_access = row.accessed_at;
      }
      if (row.accessed_at > ipCounts[key].last_access) {
        ipCounts[key].last_access = row.accessed_at;
      }
    }

    const potentialAbuse = Object.entries(ipCounts)
      .filter(([_, data]) => data.count > 20)
      .map(([key, data]) => ({
        ip_address: key.split('-')[0],
        course_id: data.course_id,
        download_count: data.count,
        first_access: data.first_access,
        last_access: data.last_access
      }));

    // Get recent activity with course titles
    const { data: recentActivityRaw } = await supabase
      .from('artifact_access_log')
      .select('id, course_id, access_type, download_source, accessed_at, ip_address')
      .order('accessed_at', { ascending: false })
      .limit(50);

    // Fetch course titles for recent activity
    const courseIds = [...new Set((recentActivityRaw || []).map(a => a.course_id))];
    const { data: coursesData } = await supabase
      .from('courses')
      .select('id, title')
      .in('id', courseIds);

    const courseTitles: Record<string, string> = {};
    for (const course of (coursesData || [])) {
      courseTitles[course.id] = course.title;
    }

    const recentActivity = (recentActivityRaw || []).map(activity => ({
      ...activity,
      course_title: courseTitles[activity.course_id] || null
    }));

    // Get daily stats for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: dailyData } = await supabase
      .from('artifact_access_log')
      .select('accessed_at, accessor_hash')
      .eq('access_type', 'download')
      .gte('accessed_at', thirtyDaysAgo);

    // Aggregate by day
    const dailyAggregates: Record<string, { downloads: number; users: Set<string> }> = {};
    
    for (const row of (dailyData || [])) {
      const date = row.accessed_at.split('T')[0];
      if (!dailyAggregates[date]) {
        dailyAggregates[date] = { downloads: 0, users: new Set() };
      }
      dailyAggregates[date].downloads++;
      if (row.accessor_hash) {
        dailyAggregates[date].users.add(row.accessor_hash);
      }
    }

    const dailyStats = Object.entries(dailyAggregates)
      .map(([date, data]) => ({
        date,
        downloads: data.downloads,
        unique_users: data.users.size
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log('[admin-download-analytics] Returning stats:', {
      totalDownloads,
      uniqueUsers,
      emailClicks,
      dashboardAccess,
      directAccess,
      abuseAlerts: potentialAbuse.length
    });

    return new Response(
      JSON.stringify({
        totalDownloads: totalDownloads || 0,
        uniqueUsers,
        emailClicks: emailClicks || 0,
        dashboardAccess: dashboardAccess || 0,
        directAccess: directAccess || 0,
        potentialAbuse,
        recentActivity,
        dailyStats
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-download-analytics] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
