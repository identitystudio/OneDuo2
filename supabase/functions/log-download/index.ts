import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
};

/**
 * Log Download Event
 * Simple endpoint to log download events from client-side
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { courseId, moduleId, source } = await req.json();

    if (!courseId) {
      return new Response(
        JSON.stringify({ error: 'Missing courseId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientIp = req.headers.get('x-forwarded-for') || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const sessionId = req.headers.get('x-session-id') || null;

    // Get accessor hash from auth if available
    let accessorHash = sessionId || 'anonymous';
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user?.email) {
        const { data: hashResult } = await supabase.rpc('hash_email', { p_email: user.email });
        accessorHash = hashResult || accessorHash;
      }
    }

    // Log the download event
    await supabase.from('artifact_access_log').insert({
      course_id: courseId,
      module_id: moduleId || null,
      access_type: 'download',
      download_source: source || 'dashboard',
      accessor_hash: accessorHash,
      ip_address: clientIp,
      user_agent: userAgent.substring(0, 500),
      download_completed: true,
    });

    console.log(`[log-download] Logged download for course ${courseId}, source: ${source}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[log-download] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to log download' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
