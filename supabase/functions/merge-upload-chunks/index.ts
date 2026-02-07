/**
 * Merge Upload Chunks - ZERO-COPY MANIFEST VERSION
 * 
 * CRITICAL: Edge functions have 256MB memory + compute limits.
 * ANY attempt to download chunks will fail for large videos.
 * 
 * SOLUTION: Create a manifest file only - NO DOWNLOADS.
 * 1. Use storage.list() to verify chunks exist (metadata only)
 * 2. Create manifest JSON listing chunk paths
 * 3. Return success with first chunk URL for processing
 * 
 * The video processing will use signed URLs to access chunks directly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MergeRequest {
  chunkPaths: string[];
  finalPath: string;
  contentType?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const { chunkPaths, finalPath, contentType = 'video/mp4' } = (await req.json()) as MergeRequest;

    if (!chunkPaths || !Array.isArray(chunkPaths) || chunkPaths.length === 0) {
      return new Response(
        JSON.stringify({ error: 'chunkPaths array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!finalPath) {
      return new Response(
        JSON.stringify({ error: 'finalPath is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[merge-upload-chunks] v3: Zero-copy manifest for ${chunkPaths.length} chunks`);

    // Just verify chunks exist using list (NO download)
    const chunkInfos: { path: string; size: number; order: number }[] = [];
    let totalSize = 0;

    // Get the folder from the first chunk
    const firstChunkParts = chunkPaths[0].split('/');
    firstChunkParts.pop(); // Remove filename
    const folder = firstChunkParts.join('/');

    // List all files in the folder (single API call, no downloads)
    const { data: allFiles, error: listError } = await supabase.storage
      .from('video-uploads')
      .list(folder);

    if (listError) {
      console.error('[merge-upload-chunks] Failed to list folder:', listError);
      throw new Error(`Failed to list chunks: ${listError.message}`);
    }

    console.log(`[merge-upload-chunks] Found ${allFiles?.length || 0} files in folder`);

    // Verify each chunk exists
    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkPath = chunkPaths[i];
      const fileName = chunkPath.split('/').pop()!;
      
      const file = allFiles?.find(f => f.name === fileName);
      if (!file) {
        throw new Error(`Chunk ${i + 1} not found: ${chunkPath}`);
      }

      const size = file.metadata?.size || 0;
      chunkInfos.push({ path: chunkPath, size, order: i });
      totalSize += size;
    }

    console.log(`[merge-upload-chunks] All chunks verified. Total: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);

    // Create manifest JSON (small, no memory issues)
    const manifest = {
      type: 'chunked-video',
      version: 3,
      finalPath,
      contentType,
      totalSize,
      chunkCount: chunkPaths.length,
      chunks: chunkInfos,
      createdAt: new Date().toISOString(),
    };

    const manifestPath = `${finalPath}.manifest.json`;
    const manifestContent = JSON.stringify(manifest, null, 2);
    
    const { error: manifestError } = await supabase.storage
      .from('video-uploads')
      .upload(manifestPath, new TextEncoder().encode(manifestContent), {
        contentType: 'application/json',
        upsert: true,
      });

    if (manifestError) {
      console.error('[merge-upload-chunks] Failed to create manifest:', manifestError);
      throw new Error(`Failed to create manifest: ${manifestError.message}`);
    }

    console.log(`[merge-upload-chunks] Manifest created: ${manifestPath}`);

    // Get signed URL for first chunk (this becomes the "video URL")
    const { data: signedUrlData } = await supabase.storage
      .from('video-uploads')
      .createSignedUrl(chunkPaths[0], 60 * 60 * 24 * 7); // 7 days

    // Get public URL structure for consistency
    const { data: publicUrlData } = supabase.storage
      .from('video-uploads')
      .getPublicUrl(finalPath);

    const duration = Date.now() - startTime;
    console.log(`[merge-upload-chunks] Complete in ${(duration / 1000).toFixed(1)}s`);

    return new Response(
      JSON.stringify({
        success: true,
        finalPath,
        manifestPath,
        totalSize,
        chunksmerged: chunkPaths.length,
        mode: 'chunked-manifest-v3',
        // Return the public URL path (processing will detect manifest)
        videoUrl: publicUrlData.publicUrl,
        firstChunkUrl: signedUrlData?.signedUrl,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[merge-upload-chunks] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
