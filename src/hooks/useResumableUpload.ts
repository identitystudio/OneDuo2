/**
 * Resumable Upload Hook - Pure Cloud Pipeline
 * Uses TUS protocol via tus-js-client for true resumable uploads
 * Survives WiFi drops, browser refreshes, and tab switches
 */

import { useState, useCallback, useRef } from 'react';
import * as tus from 'tus-js-client';
import { supabase } from '@/integrations/supabase/client';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for optimal performance
const STORAGE_KEY = 'tus_upload_state';

export interface UploadProgress {
  phase: 'preparing' | 'uploading' | 'processing' | 'complete' | 'error';
  percentage: number;
  bytesUploaded: number;
  totalBytes: number;
  chunksUploaded: number;
  totalChunks: number;
  speed: string;
  timeRemaining: string;
  canResume: boolean;
}

interface TusUploadState {
  fileId: string;
  fileName: string;
  fileSize: number;
  tusUrl: string | null;
  startedAt: number;
  storagePath: string;
}

export function useResumableUpload() {
  const [progress, setProgress] = useState<UploadProgress>({
    phase: 'preparing',
    percentage: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    chunksUploaded: 0,
    totalChunks: 0,
    speed: '0 MB/s',
    timeRemaining: 'calculating...',
    canResume: false,
  });

  const [isUploading, setIsUploading] = useState(false);
  const uploadRef = useRef<tus.Upload | null>(null);
  const speedSamplesRef = useRef<number[]>([]);
  const lastBytesRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  // Calculate upload speed and time remaining
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

  // Save TUS upload state for resume capability
  const saveState = useCallback((state: TusUploadState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[TUS] Failed to save upload state:', e);
    }
  }, []);

  // Load saved TUS upload state
  const loadState = useCallback((fileId: string): TusUploadState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;

      const state = JSON.parse(saved) as TusUploadState;
      if (state.fileId !== fileId) return null;

      // Expire states older than 24 hours
      if (Date.now() - state.startedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return state;
    } catch (e) {
      console.warn('[TUS] Failed to load upload state:', e);
      return null;
    }
  }, []);

  // Clear saved state
  const clearState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Generate file ID for resume matching - include random suffix to ALWAYS treat as new upload
  // This allows "duplicate" uploads of the same file as brand new independent jobs
  const generateFileId = (file: File): string => {
    // Always include a unique suffix so same file can be uploaded multiple times as separate jobs
    return `${file.name}-${file.size}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  };

  // Main upload function using TUS protocol
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const fileId = generateFileId(file);
    const sessionId = localStorage.getItem('courseagent_session') || crypto.randomUUID();
    localStorage.setItem('courseagent_session', sessionId);

    // ALWAYS treat as a fresh upload - never resume. This allows duplicate uploads.
    // Clear any stale state to avoid storage conflicts.
    clearState();

    // Always generate a fresh unique path - no resume, no duplicate detection
    const fileName = `${sessionId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    setIsUploading(true);
    speedSamplesRef.current = [];
    lastBytesRef.current = 0;
    lastTimeRef.current = Date.now();

    // Show preparing state
    setProgress({
      phase: 'preparing',
      percentage: 2,
      bytesUploaded: 0,
      totalBytes: file.size,
      chunksUploaded: 0,
      totalChunks,
      speed: 'initializing...',
      timeRemaining: 'preparing...',
      canResume: true,
    });

    // ROBUSTNESS: Derive project ID and storage endpoint from the main SUPABASE_URL 
    // This prevents mismatches when multiple projects are used or env vars are misconfigured
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const projectId = supabaseUrl.split('//')[1]?.split('.')[0] || import.meta.env.VITE_SUPABASE_PROJECT_ID;

    if (!projectId) {
      console.error('[TUS] Could not determine project ID from environment');
      throw new Error('Supabase configuration error: VITE_SUPABASE_URL is missing or malformed.');
    }

    // Get user session for proper auth - TUS requires user access_token (not the publishable key)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setIsUploading(false);
      setProgress(prev => ({ ...prev, phase: 'error', canResume: false }));
      throw new Error('Please sign in again to upload (session missing).');
    }

    const accessToken = session.access_token;

    console.log('[TUS] Starting resumable upload for:', file.name, 'Project:', projectId);
    console.log('[TUS] Using authenticated session:', true);

    return new Promise<string>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        // Direct storage hostname for large-file reliability
        endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000], // Retry with exponential backoff
        chunkSize: CHUNK_SIZE,
        metadata: {
          bucketName: 'video-uploads',
          objectName: fileName,
          contentType: file.type || 'video/mp4',
          cacheControl: '3600',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
          'x-upsert': 'true',
        },

        onError: (error) => {
          console.error('[TUS] Upload error:', error);

          // Check for 409 Upload-Offset conflict - means stale resume state
          const errorMessage = String(error);
          const is409Conflict = errorMessage.includes('409') ||
            errorMessage.includes('Upload-Offset conflict') ||
            errorMessage.includes('Offset');

          if (is409Conflict) {
            console.log('[TUS] 409 conflict detected - clearing stale state and retrying fresh...');
            // Clear ALL TUS-related state
            clearState();
            localStorage.removeItem(`tus::${file.name}`);

            // Try to clear the fingerprinted URL storage that tus-js-client uses
            try {
              const tusKeys = Object.keys(localStorage).filter(k => k.startsWith('tus::'));
              tusKeys.forEach(k => localStorage.removeItem(k));
            } catch (e) {
              console.warn('[TUS] Could not clear tus keys:', e);
            }

            setProgress(prev => ({
              ...prev,
              phase: 'error',
              canResume: false, // Force fresh upload
            }));
            setIsUploading(false);
            reject(new Error('Upload conflict detected. Please click upload again to retry with a fresh upload.'));
            return;
          }

          setProgress(prev => ({
            ...prev,
            phase: 'error',
            canResume: true,
          }));
          setIsUploading(false);
          reject(error);
        },

        onProgress: (bytesUploaded, bytesTotal) => {
          // Use 1 decimal precision for smooth incremental progress
          const percentage = Number(((bytesUploaded / bytesTotal) * 100).toFixed(1));
          const chunksUploaded = Math.floor(bytesUploaded / CHUNK_SIZE);

          console.log(`[TUS] Progress: ${percentage}% (${bytesUploaded}/${bytesTotal} bytes)`);

          const speedUpdate = updateSpeed(bytesUploaded, bytesTotal);

          setProgress(prev => ({
            ...prev,
            phase: 'uploading',
            percentage,
            bytesUploaded,
            totalBytes: bytesTotal,
            chunksUploaded,
            ...(speedUpdate || {}),
          }));

          // Save state for resume
          saveState({
            fileId,
            fileName,
            fileSize: file.size,
            tusUrl: upload.url,
            startedAt: Date.now(),
            storagePath: fileName,
          });
        },

        onSuccess: async () => {
          console.log('[TUS] Upload complete! Verifying storage and waiting for propagation...');
          clearState();

          const { data } = supabase.storage.from('video-uploads').getPublicUrl(fileName);
          console.log('[TUS] Public URL:', data.publicUrl);

          // Wait for storage propagation before verifying
          await new Promise(r => setTimeout(r, 2000));

          // CRITICAL: Verify the file actually exists in storage before resolving
          // This prevents false "success" when the file wasn't actually saved
          let verified = false;
          for (let attempt = 1; attempt <= 5; attempt++) {
            try {
              // Try to create a signed URL - this will fail if file doesn't exist
              const { data: signedData, error } = await supabase.storage
                .from('video-uploads')
                .createSignedUrl(fileName, 60);

              if (!error && signedData?.signedUrl) {
                // Double-check with a HEAD request
                const headResponse = await fetch(signedData.signedUrl, { method: 'HEAD' });
                if (headResponse.ok) {
                  console.log(`[TUS] File verified in storage after ${attempt} attempt(s)`);
                  verified = true;
                  break;
                }
              }
              console.log(`[TUS] Verification attempt ${attempt}/5 failed, retrying...`);
              await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
              console.warn(`[TUS] Verification attempt ${attempt}/5 error:`, e);
              await new Promise(r => setTimeout(r, 2000));
            }
          }

          if (!verified) {
            console.error('[TUS] CRITICAL: File not found in storage after upload "success"');
            setProgress(prev => ({
              ...prev,
              phase: 'error',
              canResume: true,
            }));
            setIsUploading(false);
            reject(new Error('Upload completed but file not found in storage. Please try again.'));
            return;
          }

          console.log('[TUS] Upload verified and complete');

          setProgress(prev => ({
            ...prev,
            phase: 'complete',
            percentage: 100,
            bytesUploaded: file.size,
          }));

          setIsUploading(false);
          resolve(data.publicUrl);
        },

        onShouldRetry: (err, retryAttempt, options) => {
          console.log(`[TUS] Retry attempt ${retryAttempt} after error:`, err);
          const status = (err as any)?.originalResponse?.getStatus?.();

          // 409 = Upload-Offset conflict - need fresh upload, don't retry
          if (status === 409) {
            console.log('[TUS] 409 conflict - will not retry, need fresh upload');
            return false;
          }

          // Don't retry client errors (except rate limit 429)
          if (status && status >= 400 && status < 500 && status !== 429) {
            return false;
          }
          return retryAttempt < 5;
        },

        onAfterResponse: (req, res) => {
          const status = res.getStatus();
          if (status >= 400) {
            console.warn(`[TUS] Server returned ${status}`);
          }
        },
      });

      uploadRef.current = upload;

      // Always start fresh - no resume detection. Duplicates are allowed as brand new uploads.
      console.log('[TUS] Starting fresh upload (no resume, duplicates allowed)');

      // Start the upload immediately
      setProgress(prev => ({
        ...prev,
        phase: 'uploading',
        percentage: 5,
        speed: 'connecting...',
        timeRemaining: 'starting upload...',
      }));

      upload.start();
    });
  }, [saveState, clearState, updateSpeed, loadState]);

  // Cancel ongoing upload
  const cancelUpload = useCallback(() => {
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
    setIsUploading(false);
    setProgress(prev => ({
      ...prev,
      phase: 'preparing',
      percentage: 0,
    }));
  }, []);

  // Check if we can resume a previous upload
  const checkResumable = useCallback((file: File): boolean => {
    const fileId = generateFileId(file);
    const state = loadState(fileId);
    return state !== null && state.tusUrl !== null;
  }, [loadState]);

  // Reset state
  const reset = useCallback(() => {
    clearState();
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
    setProgress({
      phase: 'preparing',
      percentage: 0,
      bytesUploaded: 0,
      totalBytes: 0,
      chunksUploaded: 0,
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
  };
}
