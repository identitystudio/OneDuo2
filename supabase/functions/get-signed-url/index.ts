import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
};

interface SignedUrlRequest {
  courseId: string;
  storagePath: string;
  expiresIn?: number; // seconds, default 3600 (1 hour)
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    const sessionId = req.headers.get('x-session-id');
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    if (!authHeader && !sessionId) {
      console.error('[get-signed-url] No authorization or session ID provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { courseId, storagePath, expiresIn = 86400 } = await req.json() as SignedUrlRequest; // 24 hours to match email promise

    if (!courseId || !storagePath) {
      return new Response(
        JSON.stringify({ error: 'Missing courseId or storagePath' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[get-signed-url] Request for course ${courseId}, path: ${storagePath}`);

    // Verify user owns the course
    let isOwner = false;
    let accessorHash = 'anonymous';

    if (authHeader) {
      // Get user from auth token
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        console.error('[get-signed-url] Invalid auth token:', userError);
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check ownership via email hash
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, user_id, email_hash')
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        console.error('[get-signed-url] Course not found:', courseError);
        return new Response(
          JSON.stringify({ error: 'Course not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Hash user's email for comparison
      const { data: hashResult } = await supabase.rpc('hash_email', { p_email: user.email });
      
      isOwner = course.user_id === user.id || course.email_hash === hashResult;
      accessorHash = hashResult || 'unknown';
    }

    if (!isOwner) {
      console.error('[get-signed-url] Access denied - user does not own course');
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine bucket from storage path
    const bucket = storagePath.startsWith('course-gifs/') ? 'course-gifs' : 'course-videos';
    const filePath = storagePath.replace(`${bucket}/`, '');

    // Generate signed URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (signedUrlError) {
      console.error('[get-signed-url] Failed to create signed URL:', signedUrlError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate signed URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log access for audit trail
    await supabase.from('artifact_access_log').insert({
      course_id: courseId,
      access_type: 'signed_url',
      accessor_hash: accessorHash,
      ip_address: clientIp,
      user_agent: userAgent.substring(0, 500), // Truncate long user agents
    });

    console.log(`[get-signed-url] Generated signed URL for course ${courseId}, expires in ${expiresIn}s`);

    return new Response(
      JSON.stringify({
        signedUrl: signedUrlData.signedUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-signed-url] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
