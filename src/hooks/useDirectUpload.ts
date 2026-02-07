/**
 * Direct Storage Upload Hook
 * Uploads directly to Supabase Storage using signed URLs
 * Bypasses edge function body limits - fixes the ~31% stall issue
 * 
 * Flow:
 * 1. Get signed upload URL from edge function
 * 2. PUT file directly to signed URL
 * 3. Retry with exponential backoff on failure
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const MAX_ATTEMPTS = 3; // total attempts (initial + retries)
const INITIAL_BACKOFF_MS = 1000;
const STORAGE_KEY = 'direct_upload_state';

export interface DirectUploadProgress {
  phase: 'preparing' | 'uploading' | 'processing' | 'complete' | 'error';
  percentage: number;
  bytesUploaded: number;
  totalBytes: number;
  speed: string;
  timeRemaining: string;
  retryCount: number;
  canResume: boolean;
}

interface UploadState {
  fileId: string;
  fileName: string;
  fileSize: number;
  storagePath: string;
  publicUrl: string;
  startedAt: number;
}

export function useDirectUpload() {
  const [progress, setProgress] = useState<DirectUploadProgress>({
    phase: 'preparing',
    percentage: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    speed: '0 MB/s',
    timeRemaining: 'calculating...',
    retryCount: 0,
    canResume: false,
  });

  const [isUploading, setIsUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
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

  const saveState = useCallback((state: UploadState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[DirectUpload] Failed to save state:', e);
    }
  }, []);

  const clearState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  /**
   * Upload file with retry logic
   */
  const uploadWithRetry = async (
    file: File,
    signedUrl: string,
    publicUrl: string,
    storagePath: string,
    retryCount = 0
  ): Promise<string> => {
    abortControllerRef.current = new AbortController();

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentage = Number(((event.loaded / event.total) * 100).toFixed(1));
          const speedUpdate = updateSpeed(event.loaded, event.total);

          setProgress(prev => ({
            ...prev,
            phase: 'uploading',
            percentage,
            bytesUploaded: event.loaded,
            totalBytes: event.total,
            retryCount,
            ...(speedUpdate || {}),
          }));

          // Save state for resume
          saveState({
            fileId: generateFileId(file),
            fileName: file.name,
            fileSize: file.size,
            storagePath,
            publicUrl,
            startedAt: Date.now(),
          });
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[DirectUpload] Upload complete!');
          clearState();
          
          // Log upload_complete event to job_logs
          const jobId = storagePath.split('/')[0]; // sessionId is used as job reference
          try {
            await supabase.from('job_logs').insert({
              job_id: jobId,
              step: 'upload_complete',
              level: 'info',
              message: 'File upload completed successfully via signed PUT URL',
              metadata: {
                video_path: storagePath,
                file_size: file.size,
                file_name: file.name,
                timestamp: new Date().toISOString(),
                http_status: xhr.status
              }
            });
            console.log('[DirectUpload] Logged upload_complete event');
          } catch (logError) {
            console.warn('[DirectUpload] Failed to log upload_complete:', logError);
          }
          
          setProgress(prev => ({
            ...prev,
            phase: 'complete',
            percentage: 100,
            bytesUploaded: file.size,
          }));
          resolve(publicUrl);
        } else {
          console.error(`[DirectUpload] Upload failed with status ${xhr.status}:`, xhr.responseText);
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        console.error('[DirectUpload] Network error');
        reject(new Error('Network error during upload'));
      };

      xhr.onabort = () => {
        console.log('[DirectUpload] Upload aborted');
        reject(new Error('Upload cancelled'));
      };

      // Open and send
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      xhr.send(file);

      // Handle abort signal
      if (abortControllerRef.current) {
        abortControllerRef.current.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }
    });
  };

  /**
   * Main upload function
   */
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    setIsUploading(true);
    speedSamplesRef.current = [];
    lastBytesRef.current = 0;
    lastTimeRef.current = Date.now();

    setProgress({
      phase: 'preparing',
      percentage: 2,
      bytesUploaded: 0,
      totalBytes: file.size,
      speed: 'initializing...',
      timeRemaining: 'preparing...',
      retryCount: 0,
      canResume: true,
    });

    console.log('[DirectUpload] Starting upload for:', file.name, 'size:', file.size);

    try {
      const sessionId = localStorage.getItem('courseagent_session') || crypto.randomUUID();
      localStorage.setItem('courseagent_session', sessionId);

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${sessionId}/${Date.now()}_${sanitizedName}`;

      // Step 1: Get signed upload URL
      setProgress(prev => ({
        ...prev,
        percentage: 3,
        speed: 'getting upload URL...',
      }));

      const { data: urlData, error: urlError } = await supabase.functions.invoke('get-upload-url', {
        body: { path: storagePath },
      });

      if (urlError || !urlData?.signedUrl || !urlData?.path) {
        throw new Error(urlError?.message || 'Failed to get upload URL');
      }

      const { data: publicUrlData } = supabase.storage
        .from('video-uploads')
        .getPublicUrl(urlData.path);

      const publicUrl = publicUrlData.publicUrl;

      console.log('[DirectUpload] Got signed URL, path:', urlData.path);

      // Step 2: Upload with retry
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const retryCount = attempt - 1;

          if (attempt > 1) {
            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 2); // 1s, 2s, 4s...
            console.log(`[DirectUpload] Retry ${retryCount}/${MAX_ATTEMPTS - 1} after ${backoffMs}ms backoff`);

            setProgress(prev => ({
              ...prev,
              phase: 'preparing',
              speed: `retrying in ${backoffMs / 1000}s...`,
              retryCount,
            }));

            await sleep(backoffMs);
          }

          setProgress(prev => ({
            ...prev,
            phase: 'uploading',
            percentage: 5,
            speed: 'connecting...',
            timeRemaining: 'starting upload...',
            retryCount,
          }));

          const uploadedPublicUrl = await uploadWithRetry(
            file,
            urlData.signedUrl,
            publicUrl,
            urlData.path,
            retryCount
          );

          setIsUploading(false);
          return uploadedPublicUrl;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.error(`[DirectUpload] Attempt ${attempt}/${MAX_ATTEMPTS} failed:`, lastError.message);

          // Don't retry if cancelled
          if (lastError.message === 'Upload cancelled') {
            throw lastError;
          }
        }
      }

      throw lastError || new Error('Upload failed after retries');
    } catch (err) {
      console.error('[DirectUpload] Upload failed:', err);
      setProgress(prev => ({
        ...prev,
        phase: 'error',
        canResume: true,
      }));
      setIsUploading(false);
      throw err;
    }
  }, [saveState, clearState, updateSpeed]);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setProgress(prev => ({
      ...prev,
      phase: 'preparing',
      percentage: 0,
    }));
  }, []);

  const reset = useCallback(() => {
    clearState();
    cancelUpload();
    setProgress({
      phase: 'preparing',
      percentage: 0,
      bytesUploaded: 0,
      totalBytes: 0,
      speed: '0 MB/s',
      timeRemaining: 'calculating...',
      retryCount: 0,
      canResume: false,
    });
  }, [clearState, cancelUpload]);

  return {
    uploadFile,
    cancelUpload,
    reset,
    progress,
    isUploading,
  };
}
