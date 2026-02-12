/**
 * Chunked Upload Hook - For Large Files (>5GB)
 * Bypasses TUS 5GB limit by splitting files into chunks
 * and uploading them separately, then merging on server
 * 
 * Flow:
 * 1. Split file into 500MB chunks
 * 2. Upload each chunk via signed URL
 * 3. Call merge-upload-chunks edge function
 * 4. Return final merged file URL
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CHUNK_SIZE = 500 * 1024 * 1024; // 500GB chunks (optimized for Pro Plan large files)


const MAX_RETRIES = 3;

export interface ChunkedUploadProgress {
  phase: 'preparing' | 'uploading' | 'merging' | 'complete' | 'error';
  percentage: number;
  bytesUploaded: number;
  totalBytes: number;
  currentChunk: number;
  totalChunks: number;
  speed: string;
  timeRemaining: string;
  canResume: boolean;
}

interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
  uploaded: boolean;
  path?: string;
}

const STORAGE_KEY = 'chunked_upload_state';

interface SavedChunkState {
  fileId: string;
  fileName: string;
  fileSize: number;
  sessionPath: string;
  chunks: ChunkInfo[];
  startedAt: number;
}

export function useChunkedUpload() {
  const [progress, setProgress] = useState<ChunkedUploadProgress>({
    phase: 'preparing',
    percentage: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    currentChunk: 0,
    totalChunks: 0,
    speed: '0 MB/s',
    timeRemaining: 'calculating...',
    canResume: false,
  });

  const [isUploading, setIsUploading] = useState(false);
  const abortRef = useRef(false);
  const fileRef = useRef<File | null>(null); // Prevents garbage collection of File object during multi-hour uploads
  const speedSamplesRef = useRef<number[]>([]);
  const lastBytesRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)} sec`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
    return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
  };

  const updateSpeed = useCallback((bytesUploaded: number, totalBytes: number) => {
    const now = Date.now();
    const timeDelta = (now - lastTimeRef.current) / 1000;

    if (timeDelta > 0.5) {
      const bytesDelta = bytesUploaded - lastBytesRef.current;
      const speed = bytesDelta / timeDelta;

      speedSamplesRef.current.push(speed);
      if (speedSamplesRef.current.length > 5) {
        speedSamplesRef.current.shift();
      }

      const avgSpeed = speedSamplesRef.current.reduce((a, b) => a + b, 0) / speedSamplesRef.current.length;
      const remainingBytes = totalBytes - bytesUploaded;
      const secondsRemaining = avgSpeed > 0 ? remainingBytes / avgSpeed : 0;

      lastBytesRef.current = bytesUploaded;
      lastTimeRef.current = now;

      return {
        speed: formatSpeed(avgSpeed),
        timeRemaining: formatTime(secondsRemaining),
      };
    }
    return null;
  }, []);

  const generateFileId = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };

  const saveState = useCallback((state: SavedChunkState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[ChunkedUpload] Failed to save state:', e);
    }
  }, []);

  const loadState = useCallback((fileId: string): SavedChunkState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;

      const state = JSON.parse(saved) as SavedChunkState;
      if (state.fileId !== fileId) return null;

      // Expire states older than 24 hours
      if (Date.now() - state.startedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return state;
    } catch (e) {
      console.warn('[ChunkedUpload] Failed to load state:', e);
      return null;
    }
  }, []);

  const clearState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * Upload a single chunk via signed URL
   */
  const uploadChunk = async (
    chunk: Blob,
    chunkPath: string,
    chunkIndex: number,
    totalChunks: number,
    baseProgress: number,
    chunkWeight: number
  ): Promise<string> => {
    // Get signed upload URL for this chunk
    const { data: urlData, error: urlError } = await supabase.functions.invoke('get-upload-url', {
      body: { path: chunkPath },
    });

    if (urlError || !urlData?.signedUrl) {
      throw new Error(urlError?.message || 'Failed to get upload URL for chunk');
    }

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && !abortRef.current) {
          const chunkProgress = event.loaded / event.total;
          const overallProgress = baseProgress + (chunkProgress * chunkWeight);
          const totalBytesUploaded = (chunkIndex * CHUNK_SIZE) + event.loaded;

          const speedUpdate = updateSpeed(totalBytesUploaded, progress.totalBytes);

          setProgress(prev => ({
            ...prev,
            percentage: Number((overallProgress * 100).toFixed(1)),
            bytesUploaded: totalBytesUploaded,
            currentChunk: chunkIndex + 1,
            ...(speedUpdate || {}),
          }));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log(`[ChunkedUpload] Chunk ${chunkIndex + 1}/${totalChunks} uploaded`);
          resolve(chunkPath);
        } else {
          // Read error body for better diagnostics
          const errorBody = xhr.responseText;
          console.error(`[ChunkedUpload] Chunk ${chunkIndex + 1} failed with status ${xhr.status}. Body:`, errorBody);
          reject(new Error(`Chunk upload failed: ${xhr.status} ${xhr.statusText}. Details: ${errorBody}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during chunk upload'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));

      xhr.open('PUT', urlData.signedUrl, true);
      // Explicitly set to application/octet-stream for signed binary uploads
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunk);

    });
  };

  /**
   * Main upload function for large files
   */
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    fileRef.current = file; // Hold reference to prevent GC during chunking
    const fileId = generateFileId(file);
    const savedState = loadState(fileId);

    setIsUploading(true);
    abortRef.current = false;
    speedSamplesRef.current = [];
    lastBytesRef.current = 0;
    lastTimeRef.current = Date.now();

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const sessionId = localStorage.getItem('courseagent_session') || crypto.randomUUID();
    localStorage.setItem('courseagent_session', sessionId);

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sessionPath = savedState?.sessionPath || `${sessionId}/${Date.now()}_${sanitizedName}`;

    // Initialize or resume chunk tracking
    let chunks: ChunkInfo[] = savedState?.chunks || [];
    if (chunks.length === 0) {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        chunks.push({
          index: i,
          start,
          end,
          size: end - start,
          uploaded: false,
        });
      }
    }

    console.log(`[ChunkedUpload] Starting upload: ${file.name}, ${totalChunks} chunks, ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB`);

    setProgress({
      phase: 'uploading',
      percentage: 0,
      bytesUploaded: 0,
      totalBytes: file.size,
      currentChunk: 0,
      totalChunks,
      speed: 'starting...',
      timeRemaining: 'calculating...',
      canResume: true,
    });

    try {
      // Upload each chunk
      for (let i = 0; i < chunks.length; i++) {
        if (abortRef.current) {
          throw new Error('Upload cancelled');
        }

        const chunk = chunks[i];

        // Skip already uploaded chunks (resume support)
        if (chunk.uploaded && chunk.path) {
          console.log(`[ChunkedUpload] Skipping chunk ${i + 1}/${totalChunks} (already uploaded)`);
          continue;
        }

        const chunkBlob = file.slice(chunk.start, chunk.end);
        const chunkPath = `${sessionPath}_chunk_${String(i).padStart(4, '0')}`;

        // Upload with retry
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            if (attempt > 1) {
              const backoffMs = 1000 * Math.pow(2, attempt - 2);
              console.log(`[ChunkedUpload] Retry ${attempt}/${MAX_RETRIES} for chunk ${i + 1} after ${backoffMs}ms`);
              await new Promise(r => setTimeout(r, backoffMs));
            }

            const baseProgress = i / totalChunks;
            const chunkWeight = 1 / totalChunks;

            await uploadChunk(chunkBlob, chunkPath, i, totalChunks, baseProgress, chunkWeight);

            // Mark chunk as uploaded
            chunks[i].uploaded = true;
            chunks[i].path = chunkPath;

            // Save state for resume
            saveState({
              fileId,
              fileName: file.name,
              fileSize: file.size,
              sessionPath,
              chunks,
              startedAt: savedState?.startedAt || Date.now(),
            });

            lastError = null;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (lastError.message === 'Upload cancelled') throw lastError;
          }
        }

        if (lastError) {
          throw lastError;
        }
      }

      // All chunks uploaded - merge them
      console.log('[ChunkedUpload] All chunks uploaded, merging...');
      setProgress(prev => ({
        ...prev,
        phase: 'merging',
        percentage: 95,
        speed: 'merging chunks...',
        timeRemaining: 'finalizing...',
      }));

      const chunkPaths = chunks
        .sort((a, b) => a.index - b.index)
        .map(c => c.path!)
        .filter(Boolean);

      const finalPath = `${sessionPath}`;

      const { data: mergeData, error: mergeError } = await supabase.functions.invoke('merge-upload-chunks', {
        body: {
          chunkPaths,
          finalPath,
          contentType: file.type || 'video/mp4',
        },
      });

      if (mergeError || !mergeData?.success) {
        throw new Error(mergeError?.message || mergeData?.error || 'Failed to merge chunks');
      }

      clearState();

      // For large files, the merge function returns a manifest + first chunk URL
      // The processing pipeline will use the first chunk URL directly
      // (External services like Replicate can stream the chunk without needing a merged file)
      let videoUrl: string;

      if (mergeData.mode === 'chunked-manifest-v3' && mergeData.firstChunkUrl) {
        // Large file: use the signed URL for the first chunk
        // Note: This works because video headers are in the first chunk
        console.log('[ChunkedUpload] Using chunked manifest mode - first chunk URL');
        videoUrl = mergeData.firstChunkUrl;
      } else {
        // Small file was merged in-memory
        const { data: publicUrlData } = supabase.storage
          .from('video-uploads')
          .getPublicUrl(finalPath);
        videoUrl = publicUrlData.publicUrl;
      }

      console.log('[ChunkedUpload] Upload complete:', videoUrl);

      setProgress({
        phase: 'complete',
        percentage: 100,
        bytesUploaded: file.size,
        totalBytes: file.size,
        currentChunk: totalChunks,
        totalChunks,
        speed: 'complete',
        timeRemaining: 'done',
        canResume: false,
      });

      setIsUploading(false);
      return videoUrl;

    } catch (err) {
      console.error('[ChunkedUpload] Upload failed:', err);
      setProgress(prev => ({
        ...prev,
        phase: 'error',
        canResume: true,
      }));
      setIsUploading(false);
      throw err;
    }
  }, [loadState, saveState, clearState, updateSpeed]);

  const cancelUpload = useCallback(() => {
    abortRef.current = true;
    setIsUploading(false);
    setProgress(prev => ({
      ...prev,
      phase: 'preparing',
      percentage: 0,
    }));
  }, []);

  const checkResumable = useCallback((file: File): boolean => {
    const fileId = generateFileId(file);
    const state = loadState(fileId);
    return state !== null && state.chunks.some(c => c.uploaded);
  }, [loadState]);

  const reset = useCallback(() => {
    clearState();
    abortRef.current = true;
    setProgress({
      phase: 'preparing',
      percentage: 0,
      bytesUploaded: 0,
      totalBytes: 0,
      currentChunk: 0,
      totalChunks: 0,
      speed: '0 MB/s',
      timeRemaining: 'calculating...',
      canResume: false,
    });
    setIsUploading(false);
  }, [clearState]);

  return {
    uploadFile,
    cancelUpload,
    checkResumable,
    reset,
    progress,
    isUploading,
    CHUNK_SIZE,
  };
}

/**
 * Check if a file needs chunked upload (>4.5GB)
 */
export function needsChunkedUpload(file: File): boolean {
  const THRESHOLD = 5 * 1024 * 1024 * 1024; // 5GB (TUS/Supabase single-file limit)
  return file.size > THRESHOLD;
}
