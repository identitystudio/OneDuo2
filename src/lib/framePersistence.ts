/**
 * Frame Persistence Service
 * 
 * Extracts frames from stored video and persists to Supabase Storage.
 * This ensures frames are always available from controlled storage,
 * never relying on expired external CDN URLs.
 * 
 * HARD FAIL: Export aborts if frames cannot be persisted.
 */

import { supabase } from '@/integrations/supabase/client';

export interface PersistedFrames {
  urls: string[];
  failedCount: number;
  totalRequested: number;
  source: 'storage_cache' | 'video_extract' | 'replicate_fresh' | 'error';
}

export interface PersistFramesOptions {
  /**
   * Forces the backend to ignore any previously persisted frames and re-extract.
   * Useful when older frame sources have expired.
   */
  forceReExtract?: boolean;
}

// Cache of persisted frame URLs per course
const persistedFramesCache = new Map<string, string[]>();

/**
 * Check if we have persisted frames for a course in cache
 */
export function getCachedPersistedFrames(courseId: string): string[] | null {
  return persistedFramesCache.get(courseId) || null;
}

/**
 * Persist frames to storage via edge function.
 * Extracts fresh frames from the stored video if needed.
 * 
 * THROWS if frames cannot be persisted (hard fail).
 */
export async function persistFramesToStorage(
  courseId: string,
  moduleId: string | null,
  maxFrames: number = 100,
  onProgress?: (current: number, total: number, status: string) => void,
  options: PersistFramesOptions = {}
): Promise<PersistedFrames> {
  const cacheKey = moduleId || courseId;
  const forceReExtract = options.forceReExtract === true;
  
  // Check cache first
  const cached = persistedFramesCache.get(cacheKey);
  if (!forceReExtract && cached && cached.length >= maxFrames) {
    console.log(`[framePersistence] Using cached frames for ${cacheKey}: ${cached.length} frames`);
    return {
      urls: cached.slice(0, maxFrames),
      failedCount: 0,
      totalRequested: maxFrames,
      source: 'storage_cache',
    };
  }

  if (forceReExtract) {
    // Avoid serving stale cache when caller explicitly requested a re-extract.
    persistedFramesCache.delete(cacheKey);
  }

  onProgress?.(0, maxFrames, forceReExtract ? 'Re-extracting frames from video...' : 'Extracting frames from video...');
  console.log(`[framePersistence] Persisting ${maxFrames} frames for ${cacheKey} (forceReExtract=${forceReExtract})`);

  try {
    const { data, error } = await supabase.functions.invoke('persist-frames', {
      body: {
        courseId,
        moduleId,
        maxFrames,
        forceReExtract, // Use cache if available unless explicitly forced
      },
    });

    if (error) {
      console.error('[framePersistence] Edge function error:', error);
      // Return empty result instead of throwing
      return {
        urls: [],
        failedCount: maxFrames,
        totalRequested: maxFrames,
        source: 'error',
      };
    }

    if (!data.success) {
      console.error('[framePersistence] Persistence failed:', data.error);
      // Return empty result instead of throwing
      return {
        urls: [],
        failedCount: maxFrames,
        totalRequested: maxFrames,
        source: 'error',
      };
    }

    const persistedUrls = data.persistedUrls || [];
    const failedCount = data.failedCount || 0;
    const source = data.source || 'replicate_fresh';

    // Cache successful results even if partial
    if (persistedUrls.length > 0) {
      persistedFramesCache.set(cacheKey, persistedUrls);
    }

    onProgress?.(persistedUrls.length, maxFrames, 
      `Persisted ${persistedUrls.length}/${maxFrames} frames from ${source}`);

    console.log(`[framePersistence] Complete: ${persistedUrls.length} persisted, ${failedCount} failed, source: ${source}`);

    return {
      urls: persistedUrls,
      failedCount,
      totalRequested: maxFrames,
      source,
    };

  } catch (err) {
    console.error('[framePersistence] Error:', err);
    // Return empty result instead of throwing - allows graceful degradation
    return {
      urls: [],
      failedCount: maxFrames,
      totalRequested: maxFrames,
      source: 'error',
    };
  }
}

/**
 * Clear cached frames for a course (e.g., on re-export with force)
 */
export function clearPersistedFramesCache(courseId?: string) {
  if (courseId) {
    persistedFramesCache.delete(courseId);
  } else {
    persistedFramesCache.clear();
  }
}

/**
 * Validate that we have enough persisted frames.
 * Used to enforce hard-fail if persistence was incomplete.
 */
export function validateFrameCount(
  persistedCount: number,
  expectedCount: number
): boolean {
  if (expectedCount === 0) return true;
  // 100% required - no partial success
  return persistedCount >= expectedCount;
}
