import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetFileRequest {
    token: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { token } = await req.json() as GetFileRequest;

        if (!token) {
            return new Response(
                JSON.stringify({ error: 'Missing token' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify token and get file path
        const { data: exportRecord, error: dbError } = await supabase
            .from('pdf_exports')
            .select('*, courses(title)')
            .eq('token', token)
            .single();

        if (dbError || !exportRecord) {
            return new Response(
                JSON.stringify({ error: 'Invalid or expired download link' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check expiry
        if (new Date(exportRecord.expires_at) < new Date()) {
            return new Response(
                JSON.stringify({ error: 'This download link has expired' }),
                { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Generate signed URL
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('course-files')
            .createSignedUrl(exportRecord.file_path, 300); // 5 minutes validity for the signed URL

        if (signedUrlError) {
            console.error('[get-export-file] Storage error:', signedUrlError);
            throw new Error('Failed to generate signed URL');
        }

        return new Response(
            JSON.stringify({
                signedUrl: signedUrlData.signedUrl,
                title: exportRecord.courses.title,
                fileName: exportRecord.file_path.split('/').pop()
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[get-export-file] Error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
