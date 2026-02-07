/**
 * Stream Chunked Video - Serves chunked uploads as a single video stream
 * 
 * This edge function acts as a proxy that streams multiple storage chunks
 * as a single continuous video file. This allows Replicate's video-to-frames
 * model to process large videos that were uploaded in chunks.
 * 
 * IMPORTANT: Uses Deno streaming APIs to avoid memory limits.
 * Each chunk is streamed through, not buffered entirely in memory.
 * 
 * Usage:
 * GET /stream-chunked-video?manifest={manifestPath}
 * 
 * Returns a streaming video/mp4 response that concatenates all chunks.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ChunkInfo {
  path: string;
  size: number;
  order: number;
}

interface Manifest {
  type: string;
  version: number;
  finalPath: string;
  contentType: string;
  totalSize: number;
  chunkCount: number;
  chunks: ChunkInfo[];
  createdAt: string;
}

type ByteRange = { start: number; end: number }; // inclusive

function parseRangeHeader(rangeHeader: string | null, totalSize: number): ByteRange | null {
  if (!rangeHeader) return null;

  // Only support single range.
  // Examples:
  // - bytes=0-499
  // - bytes=500-
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const startStr = match[1];
  const endStr = match[2];

  // Suffix ranges (bytes=-500) not supported.
  if (!startStr && endStr) return null;

  let start = startStr ? Number(startStr) : 0;
  let end = endStr ? Number(endStr) : totalSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0) return null;
  if (start > end) return null;
  if (start >= totalSize) return null;

  end = Math.min(end, totalSize - 1);
  return { start, end };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getChunkSpan(sortedChunks: ChunkInfo[]): Array<{ chunk: ChunkInfo; start: number; end: number }> {
  let cursor = 0;
  return sortedChunks.map((chunk) => {
    const start = cursor;
    const end = cursor + chunk.size - 1;
    cursor = end + 1;
    return { chunk, start, end };
  });
}

function findChunkForOffset(
  spans: Array<{ chunk: ChunkInfo; start: number; end: number }>,
  absoluteOffset: number
): { chunk: ChunkInfo; chunkStart: number; chunkEnd: number; offsetInChunk: number } {
  for (const span of spans) {
    if (absoluteOffset >= span.start && absoluteOffset <= span.end) {
      return {
        chunk: span.chunk,
        chunkStart: span.start,
        chunkEnd: span.end,
        offsetInChunk: absoluteOffset - span.start,
      };
    }
  }
  // Should never happen if caller validated.
  const last = spans[spans.length - 1];
  return {
    chunk: last.chunk,
    chunkStart: last.start,
    chunkEnd: last.end,
    offsetInChunk: last.chunk.size - 1,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const url = new URL(req.url);
    const manifestPath = url.searchParams.get('manifest');
    const courseId = url.searchParams.get('courseId');

    if (!manifestPath && !courseId) {
      return new Response(JSON.stringify({ 
        error: 'Either manifest path or courseId is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let manifest: Manifest;

    if (manifestPath) {
      // Direct manifest path provided
      const { data, error } = await supabase.storage
        .from('video-uploads')
        .download(manifestPath);

      if (error || !data) {
        console.error('[stream-chunked-video] Failed to download manifest:', error);
        return new Response(JSON.stringify({ error: 'Manifest not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      manifest = JSON.parse(await data.text());
    } else {
      // Lookup manifest from courseId
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('video_url')
        .eq('id', courseId)
        .single();

      if (courseError || !course?.video_url) {
        return new Response(JSON.stringify({ error: 'Course not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Extract path and find manifest
      const videoUrl = course.video_url;
      const match = videoUrl.match(/video-uploads\/(.+?)(?:\?|$)/);
      if (!match) {
        return new Response(JSON.stringify({ error: 'Invalid video URL format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let basePath = match[1];
      // Strip _chunk_XXXX if present
      const chunkMatch = basePath.match(/^(.+?)_chunk_\d+$/);
      if (chunkMatch) {
        basePath = chunkMatch[1];
      }

      const manifestFilePath = `${basePath}.manifest.json`;
      const { data, error } = await supabase.storage
        .from('video-uploads')
        .download(manifestFilePath);

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'This is not a chunked upload' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      manifest = JSON.parse(await data.text());
    }

    console.log(`[stream-chunked-video] Streaming ${manifest.chunkCount} chunks, total ${(manifest.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);

    // Sort chunks by order
    const sortedChunks = [...manifest.chunks].sort((a, b) => a.order - b.order);

    // Parse optional HTTP Range header (enables resumable downloads for large videos)
    const requestedRange = parseRangeHeader(req.headers.get('range'), manifest.totalSize);
    const isRangeRequest = !!requestedRange;

    const responseStart = requestedRange?.start ?? 0;
    const responseEnd = requestedRange?.end ?? (manifest.totalSize - 1);
    const responseLength = responseEnd - responseStart + 1;

    // HEAD: return only headers
    if (req.method === 'HEAD') {
      return new Response(null, {
        status: isRangeRequest ? 206 : 200,
        headers: {
          ...corsHeaders,
          'Content-Type': manifest.contentType || 'video/mp4',
          'Content-Length': responseLength.toString(),
          'Accept-Ranges': 'bytes',
          ...(isRangeRequest
            ? { 'Content-Range': `bytes ${responseStart}-${responseEnd}/${manifest.totalSize}` }
            : {}),
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // For invalid/unsupported ranges, respond 416
    if (req.headers.get('range') && !requestedRange) {
      return new Response(null, {
        status: 416,
        headers: {
          ...corsHeaders,
          'Content-Range': `bytes */${manifest.totalSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        },
      });
    }

    const spans = getChunkSpan(sortedChunks);

    async function getSignedUrlForChunk(path: string): Promise<string> {
      const { data: signedUrlData, error: signedError } = await supabase.storage
        .from('video-uploads')
        .createSignedUrl(path, 3600); // 1 hour validity

      if (signedError || !signedUrlData?.signedUrl) {
        throw new Error(`Failed to access chunk: ${signedError?.message || 'unknown error'}`);
      }
      return signedUrlData.signedUrl;
    }

    async function streamChunkSegment(
      chunk: ChunkInfo,
      startOffsetInChunk: number,
      endOffsetInChunk: number,
      writer: WritableStreamDefaultWriter<Uint8Array>
    ) {
      const expectedBytes = endOffsetInChunk - startOffsetInChunk + 1;
      let bytesSent = 0;
      let attempt = 0;

      // Always stream via Range so we can resume on mid-chunk disconnects.
      while (bytesSent < expectedBytes) {
        if (req.signal.aborted) throw new Error('Client aborted');

        attempt += 1;
        if (attempt > 6) {
          throw new Error(
            `Chunk stream retries exhausted for ${chunk.path} (${bytesSent}/${expectedBytes} bytes sent)`
          );
        }

        const rangeStart = startOffsetInChunk + bytesSent;
        const rangeEnd = endOffsetInChunk;

        let signedUrl: string;
        try {
          signedUrl = await getSignedUrlForChunk(chunk.path);
        } catch (e) {
          // Backoff for transient auth/storage hiccups
          await sleep(250 * attempt);
          continue;
        }

        let response: Response;
        try {
          response = await fetch(signedUrl, {
            headers: {
              Range: `bytes=${rangeStart}-${rangeEnd}`,
            },
          });
        } catch (e) {
          await sleep(250 * attempt);
          continue;
        }

        // Storage should respond 206 for Range requests. Some CDNs may respond 200.
        if (!response.ok) {
          await sleep(250 * attempt);
          continue;
        }

        // If server ignored the range and returned full content starting at 0, we can't safely resume.
        // Fail fast rather than corrupting the concatenated output.
        if (response.status === 200 && rangeStart !== 0) {
          throw new Error(`Upstream did not honor Range requests for chunk ${chunk.path}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          await sleep(250 * attempt);
          continue;
        }

        try {
          while (bytesSent < expectedBytes) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

             const remaining = expectedBytes - bytesSent;
             if (value.byteLength <= remaining) {
               // IMPORTANT: writer.write() applies backpressure so we don't buffer GBs in memory.
               await writer.write(value);
               bytesSent += value.byteLength;
             } else {
               // Trim extra (shouldn't happen, but protects us if upstream sends more than requested)
               await writer.write(value.subarray(0, remaining));
               bytesSent += remaining;
               try {
                 await reader.cancel();
               } catch {
                 // ignore
               }
               break;
             }
          }
        } catch (e) {
          // Reader error mid-stream: retry from current bytesSent
        }

        // If we fell short (disconnect), loop retries from current bytesSent.
        if (bytesSent < expectedBytes) {
          await sleep(250 * attempt);
        }
      }
    }

    // Create a backpressure-aware streaming response that concatenates all chunks.
    // Using TransformStream + writer.write() prevents the function from buffering large amounts of data in memory
    // when the downstream consumer (e.g. Replicate) reads slowly.
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    (async () => {
      try {
        // Range-aware stream: map requested byte range to chunk segments.
        let absoluteCursor = responseStart;
        const endAbsolute = responseEnd;

        while (absoluteCursor <= endAbsolute) {
          const found = findChunkForOffset(spans, absoluteCursor);

          const maxReadableInThisChunk = Math.min(found.chunkEnd, endAbsolute);
          const startOffsetInChunk = found.offsetInChunk;
          const endOffsetInChunk = maxReadableInThisChunk - found.chunkStart;

          console.log(
            `[stream-chunked-video] Streaming chunk segment: ${found.chunk.path} (chunkBytes ${startOffsetInChunk}-${endOffsetInChunk})`
          );

          await streamChunkSegment(found.chunk, startOffsetInChunk, endOffsetInChunk, writer);

          absoluteCursor = maxReadableInThisChunk + 1;
        }

        console.log(`[stream-chunked-video] All chunks streamed successfully`);
        await writer.close();
      } catch (error) {
        console.error('[stream-chunked-video] Streaming error:', error);
        try {
          await writer.abort(error);
        } catch {
          // ignore
        }
      }
    })();

    // Return streaming response with video content type
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': manifest.contentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      ...(isRangeRequest
        ? {
            'Content-Range': `bytes ${responseStart}-${responseEnd}/${manifest.totalSize}`,
            'Content-Length': responseLength.toString(),
          }
        : {}),
      // Avoid caching streamed, user-specific content
      'Cache-Control': 'private, max-age=3600',
    };

    return new Response(readable, {
      status: isRangeRequest ? 206 : 200,
      headers: responseHeaders,
    });

  } catch (err) {
    console.error('[stream-chunked-video] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
