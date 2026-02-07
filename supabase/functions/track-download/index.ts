import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
};

/**
 * Track Download Edge Function
 * 
 * This function serves as a tracking redirect for artifact downloads.
 * It logs analytics data before redirecting the user to the actual download page.
 * 
 * For MODULE downloads: Redirects to /download/module/:moduleId for client-side PDF generation
 * For COURSE downloads: Redirects to signed URL if available, otherwise to /download/:courseId
 * 
 * Query Parameters:
 * - courseId: The course ID
 * - moduleId: Optional module ID for multi-module courses
 * - source: Where the click came from ('email', 'dashboard', 'direct')
 * - token: Share token for public access (optional)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get app URL for redirects
    const appUrl = supabaseUrl.replace('.supabase.co', '.lovable.app');

    const url = new URL(req.url);
    const courseId = url.searchParams.get('courseId');
    const moduleId = url.searchParams.get('moduleId');
    const source = url.searchParams.get('source') || 'direct';
    const shareToken = url.searchParams.get('token');

    // Extract request metadata
    const clientIp = req.headers.get('x-forwarded-for') || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const referrer = req.headers.get('referer') || req.headers.get('referrer') || null;
    const sessionId = req.headers.get('x-session-id') || null;

    if (!courseId) {
      console.error('[track-download] Missing courseId parameter');
      return new Response(
        JSON.stringify({ error: 'Missing courseId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[track-download] Tracking download for course ${courseId}, moduleId: ${moduleId}, source: ${source}`);

    // Verify access - either by share token or ownership
    let course;
    let accessorHash = 'anonymous';

    if (shareToken) {
      // Public access via share token
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, share_enabled, share_token, course_files, email')
        .eq('id', courseId)
        .eq('share_token', shareToken)
        .eq('share_enabled', true)
        .single();

      if (error || !data) {
        console.error('[track-download] Invalid share token or course not found');
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      course = data;
      accessorHash = `share_${shareToken.substring(0, 8)}`;
    } else {
      // Check auth token
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        
        if (!userError && user) {
          const { data: hashResult } = await supabase.rpc('hash_email', { p_email: user.email });
          accessorHash = hashResult || 'unknown';
        }
      }

      // Fetch course
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, course_files, email')
        .eq('id', courseId)
        .single();

      if (error || !data) {
        console.error('[track-download] Course not found:', error);
        return new Response(
          JSON.stringify({ error: 'Course not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      course = data;
    }

    // Generate session fingerprint for abuse detection
    const fingerprint = await generateFingerprint(clientIp, userAgent, sessionId);

    // Check for abuse patterns (more than 10 downloads from same IP in 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentDownloads } = await supabase
      .from('artifact_access_log')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId)
      .eq('ip_address', clientIp)
      .gte('accessed_at', oneHourAgo);

    if (recentDownloads && recentDownloads > 50) {
      console.warn(`[track-download] Potential abuse detected: ${recentDownloads} downloads from ${clientIp}`);
      // Log but don't block - could be legitimate shared office
    }

    // Log the download access
    await supabase.from('artifact_access_log').insert({
      course_id: courseId,
      module_id: moduleId || null,
      access_type: 'download',
      accessor_hash: accessorHash,
      ip_address: clientIp,
      user_agent: userAgent.substring(0, 500),
      download_source: source,
      referrer: referrer?.substring(0, 500) || null,
      download_completed: true,
      session_fingerprint: fingerprint,
    });

    console.log(`[track-download] Download logged for course ${courseId}${moduleId ? `, module ${moduleId}` : ''}`);

    // If this is a MODULE download, redirect to the client-side module download page
    // This generates PDFs on-demand from the module's raw data (transcript + frames)
    if (moduleId) {
      console.log(`[track-download] Redirecting to module download page: /download/module/${moduleId}`);
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': `${appUrl}/download/module/${moduleId}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // For COURSE downloads (legacy single-module), try to find a PDF file
    const courseFiles = course.course_files as Array<{ type: string; storage_path: string; filename: string }> || [];
    const pdfFile = courseFiles.find(f => f.type === 'pdf');

    if (!pdfFile) {
      // No pre-generated PDF - redirect to client-side download page
      console.log(`[track-download] No PDF file found, redirecting to client-side download: /download/${courseId}`);
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': `${appUrl}/download/${courseId}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Generate signed URL for the PDF (24 hours to match email promise)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('course-files')
      .createSignedUrl(pdfFile.storage_path.replace('course-files/', ''), 86400);

    if (signedUrlError) {
      console.error('[track-download] Failed to generate signed URL:', signedUrlError);
      // Fallback to client-side download
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': `${appUrl}/download/${courseId}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Redirect to the signed URL
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': signedUrlData.signedUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('[track-download] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Generate a session fingerprint for abuse detection
 */
async function generateFingerprint(ip: string, userAgent: string, sessionId: string | null): Promise<string> {
  const data = `${ip}-${userAgent}-${sessionId || 'no-session'}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
