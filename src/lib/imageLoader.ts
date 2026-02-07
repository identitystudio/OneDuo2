/**
 * Robust Image Loader with Retry and Timeout
 * Handles loading images with proper error handling for PDF generation
 * 
 * FIXED: Uses <img> element instead of fetch() to bypass CORS restrictions
 * for external CDN images (replicate.delivery, etc.)
 * 
 * OPTIMIZED: Parallel loading with memory caching for faster PDF generation
 */

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds - faster timeout for parallel loads
const DEFAULT_RETRIES = 1; // 1 retry = 2 total attempts (faster)
const MAX_WIDTH = 1200; // Increased to 1200 for crisp text readability in PDFs

// In-memory cache for loaded images (persists across PDF generations in same session)
const imageCache = new Map<string, string>();

export function clearImageCache() {
  imageCache.clear();
}

export function getCachedImage(url: string): string | null {
  return imageCache.get(url) || null;
}

export interface ImageLoadResult {
  dataUrl: string | null;
  success: boolean;
  error?: string;
}

/**
 * Load image via <img> element - bypasses CORS restrictions
 * This is the key fix: fetch() is blocked by CORS, but <img crossOrigin="anonymous"> works
 */
function loadImageElement(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Critical: allows canvas access

    const timeoutId = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Image load failed'));
    };

    img.src = url;
  });
}

/**
 * Convert loaded image to compressed base64 via canvas
 */
function imageToBase64ViaCanvas(img: HTMLImageElement, quality: number = 0.5): string | null {
  try {
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('[imageLoader] Canvas context unavailable');
      return null;
    }

    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    // Validate that we got actual image data, not empty canvas
    if (dataUrl.length < 1000) {
      console.warn('[imageLoader] Canvas produced suspiciously small output');
      return null;
    }

    return dataUrl;
  } catch (err) {
    // Canvas tainted by CORS - this shouldn't happen with crossOrigin='anonymous'
    // but some servers don't send proper CORS headers
    console.error('[imageLoader] Canvas conversion failed:', err);
    return null;
  }
}

/**
 * Load and convert image to base64 with retry logic
 * Uses <img> element to bypass CORS restrictions
 */
export async function imageToBase64WithRetry(
  url: string,
  quality: number = 0.5,
  retries: number = DEFAULT_RETRIES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ImageLoadResult> {
  // Check cache first - instant return if available
  const cached = imageCache.get(url);
  if (cached) {
    return { dataUrl: cached, success: true };
  }

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Only log on retry to reduce console spam
      if (attempt > 0) {
        console.log(`[imageLoader] Retry ${attempt}/${retries} for: ${url.substring(0, 50)}...`);
      }

      const img = await loadImageElement(url, timeoutMs);

      if (!img.naturalWidth || !img.naturalHeight) {
        lastError = 'Image loaded but has zero dimensions';
        continue;
      }

      const dataUrl = imageToBase64ViaCanvas(img, quality);

      if (!dataUrl) {
        lastError = 'Canvas conversion failed';
        continue;
      }

      // Cache the result for future use
      imageCache.set(url, dataUrl);

      return { dataUrl, success: true };
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('Timeout')) {
          lastError = `Timeout (${timeoutMs}ms)`;
        } else if (err.message.includes('load failed')) {
          lastError = 'Network/CORS error';
        } else {
          lastError = err.message;
        }
      } else {
        lastError = 'Unknown error';
      }

      // Brief delay before retry
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.error(`[imageLoader] FAILED after ${retries + 1} attempts: ${url.substring(0, 60)}... - ${lastError}`);
  return {
    dataUrl: null,
    success: false,
    error: lastError,
  };
}

/**
 * Sample frames evenly to represent the full video duration
 */
export function sampleFramesEvenly(frames: string[], max: number): string[] {
  if (frames.length <= max) return frames;

  const step = frames.length / max;
  const sampled: string[] = [];

  for (let i = 0; i < max; i++) {
    const idx = Math.floor(i * step);
    sampled.push(frames[idx]);
  }

  return sampled;
}

/**
 * Calculate appropriate frame sample size for course size
 */
export function getRecommendedFrameSampleSize(totalFrames: number): number {
  // Very large courses (15,000+ frames): sample 1500 frames
  if (totalFrames > 10000) return 1500;
  // Large courses (5000-10000 frames): sample 1000 frames
  if (totalFrames > 5000) return 1000;
  // Medium courses (2000-5000 frames): sample 500 frames
  if (totalFrames > 2000) return 500;
  // Small courses: use all frames up to 500
  return Math.min(totalFrames, 500);
}

/**
 * Get appropriate image quality based on course size
 * HIGH QUALITY for AI readability - text must be crisp
 */
export function getRecommendedImageQuality(totalFrames: number): number {
  // Prioritize text readability over file size
  // AI needs to read on-screen text clearly
  if (totalFrames > 3000) return 0.70;
  if (totalFrames > 1000) return 0.80;
  return 0.90; // High quality default for crisp text
}

/**
 * Batch load images with progress callback and failure tracking
 */
export async function batchLoadImages(
  urls: string[],
  quality: number = 0.5,
  onProgress?: (loaded: number, total: number, failed: number) => void
): Promise<{ results: ImageLoadResult[]; successCount: number; failCount: number }> {
  const results: ImageLoadResult[] = [];
  let successCount = 0;
  let failCount = 0;

  // OPTIMIZED: Increased batch size to 15 for faster parallel loading
  // Modern browsers handle 15+ concurrent image loads efficiently
  const BATCH_SIZE = 15;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(url => imageToBase64WithRetry(url, quality))
    );

    for (const result of batchResults) {
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    onProgress?.(results.length, urls.length, failCount);
  }

  return { results, successCount, failCount };
}

/**
 * Pre-load images into cache (fire-and-forget for background loading)
 */
export function preloadImages(urls: string[], quality: number = 0.5): void {
  // Load in background without blocking
  const PRELOAD_BATCH = 10;
  let idx = 0;

  const loadNext = () => {
    if (idx >= urls.length) return;

    const batch = urls.slice(idx, idx + PRELOAD_BATCH);
    idx += PRELOAD_BATCH;

    Promise.all(batch.map(url => imageToBase64WithRetry(url, quality)))
      .then(() => {
        // Continue with next batch after a small delay to not block main thread
        setTimeout(loadNext, 50);
      })
      .catch(() => {
        // Ignore errors during preload - they'll be handled during actual load
        setTimeout(loadNext, 50);
      });
  };

  loadNext();
}
