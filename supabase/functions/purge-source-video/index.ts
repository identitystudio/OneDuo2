/**
 * Purge Source Video Edge Function
 * 
 * Zero-Knowledge Ghost Upload Architecture
 * 
 * This function immediately and permanently deletes the original source video
 * after frame extraction is complete. This ensures OneDuo operates as a 
 * "transformation engine" rather than a "content hosting platform".
 * 
 * Legal Posture:
 * - Original video is purged immediately after derivatives are created
 * - We retain only: extracted frames (derivatives), OCR text (transformations), PDF artifacts (new work)
 * - We CANNOT comply with requests to provide original content because we do not possess it
 * 
 * Called automatically by process-course after frame extraction completes.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface PurgeRequest {
  courseId?: string;
  moduleId?: string;
  storagePath: string;
  method?: 'automatic' | 'cron' | 'manual';
}

interface PurgeResult {
  success: boolean;
  purgedAt?: string;
  storagePath?: string;
  error?: string;
  auditLogId?: string;
}

// Extract storage path from a full Supabase storage URL
function extractStoragePath(url: string): string | null {
  if (!url) return null;
  
  // Handle full Supabase storage URLs
  // Format: https://xxx.supabase.co/storage/v1/object/public/bucket-name/path/to/file.mp4
  // or: https://xxx.supabase.co/storage/v1/object/sign/bucket-name/path/to/file.mp4?token=xxx
  const storageMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^?]+)/);
  if (storageMatch) {
    return storageMatch[1]; // Returns: bucket-name/path/to/file.mp4
  }
  
  // If it's already just a path, return as-is
  if (!url.startsWith('http')) {
    return url;
  }
  
  return null;
}

// Parse bucket and path from a combined storage path
function parseBucketAndPath(storagePath: string): { bucket: string; path: string } | null {
  const parts = storagePath.split('/');
  if (parts.length < 2) return null;
  
  const bucket = parts[0];
  const path = parts.slice(1).join('/');
  return { bucket, path };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: PurgeRequest = await req.json();
    const { courseId, moduleId, storagePath, method = 'automatic' } = body;

    console.log(`[purge-source-video] Request: courseId=${courseId}, moduleId=${moduleId}, path=${storagePath?.substring(0, 50)}...`);

    if (!storagePath) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "storagePath is required" 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Extract the actual storage path if it's a full URL
    const cleanPath = extractStoragePath(storagePath) || storagePath;
    const bucketInfo = parseBucketAndPath(cleanPath);

    if (!bucketInfo) {
      console.error(`[purge-source-video] Could not parse bucket/path from: ${cleanPath}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Invalid storage path format" 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { bucket, path } = bucketInfo;
    console.log(`[purge-source-video] Parsed: bucket=${bucket}, path=${path}`);

    // Get file metadata and compute SHA-256 hash before deletion (for audit log)
    let fileSizeBytes: number | null = null;
    let fileHash: string | null = null;
    
    try {
      // Try to get file info - this may fail if file doesn't exist
      const { data: fileList, error: listError } = await supabase.storage
        .from(bucket)
        .list(path.split('/').slice(0, -1).join('/'), {
          limit: 1,
          search: path.split('/').pop()
        });
      
      if (!listError && fileList && fileList.length > 0) {
        const file = fileList.find(f => f.name === path.split('/').pop());
        if (file) {
          fileSizeBytes = file.metadata?.size || null;
        }
      }
    } catch (e) {
      // Ignore metadata errors - file may already be deleted
      console.log(`[purge-source-video] Could not get file metadata: ${e}`);
    }

    // Compute SHA-256 hash of file content before deletion (Ephemeral Purge Certifier)
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(path);
      
      if (!downloadError && fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        fileHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        console.log(`[purge-source-video] Computed SHA-256: ${fileHash.substring(0, 16)}...`);
      }
    } catch (e) {
      // Hash computation is best-effort - don't fail the purge
      console.log(`[purge-source-video] Could not compute file hash: ${e}`);
    }

    // Delete the file from storage
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (deleteError) {
      // Check if it's a "not found" error - that's actually OK (already deleted)
      const isNotFound = deleteError.message?.toLowerCase().includes('not found') ||
                         deleteError.message?.toLowerCase().includes('object not found');
      
      if (isNotFound) {
        console.log(`[purge-source-video] File already deleted or not found: ${path}`);
      } else {
        console.error(`[purge-source-video] Delete error:`, deleteError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Failed to delete: ${deleteError.message}` 
        }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    const purgedAt = new Date().toISOString();

    // Log to purge_audit_log for legal compliance (with SHA-256 content hash)
    const { data: auditLog, error: auditError } = await supabase
      .from("purge_audit_log")
      .insert({
        course_id: courseId || null,
        module_id: moduleId || null,
        storage_path: cleanPath,
        purged_at: purgedAt,
        purge_method: method,
        file_size_bytes: fileSizeBytes,
        file_hash: fileHash, // SHA-256 hash of content before destruction
        verified: true // Verified = we confirmed deletion or file was already gone
      })
      .select("id")
      .single();

    if (auditError) {
      console.error(`[purge-source-video] Failed to create audit log:`, auditError);
      // Don't fail the request - purge succeeded, audit is secondary
    }

    // Update the source_purged_at timestamp on the course/module
    if (courseId) {
      await supabase
        .from("courses")
        .update({ source_purged_at: purgedAt })
        .eq("id", courseId);
    }

    if (moduleId) {
      await supabase
        .from("course_modules")
        .update({ source_purged_at: purgedAt })
        .eq("id", moduleId);
    }

    // Clear the video_url field if this is a module (optional - keeps the DB clean)
    // We keep the URL for courses as it might be needed for reference
    if (moduleId) {
      await supabase
        .from("course_modules")
        .update({ 
          video_url: null,
          storage_path: null
        })
        .eq("id", moduleId);
    }

    console.log(`[purge-source-video] SUCCESS: Purged ${cleanPath}, audit log ${auditLog?.id}`);

    const result: PurgeResult = {
      success: true,
      purgedAt,
      storagePath: cleanPath,
      auditLogId: auditLog?.id
    };

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[purge-source-video] Error:`, errorMessage);

    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
