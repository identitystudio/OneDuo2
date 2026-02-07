/**
 * Submission Retry Hook
 * Handles retry logic when uploads succeed but course creation fails
 * Persists uploaded module URLs so users don't have to re-upload
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UploadedModule {
  title: string;
  videoUrl: string;
  moduleNumber: number;
  durationSeconds?: number;
  moduleFiles?: { name: string; storagePath: string; size: number }[];
}

interface PendingSubmission {
  courseTitle: string;
  email: string;
  uploadedModules: UploadedModule[];
  courseFiles?: { name: string; storagePath: string; size: number }[];
  teamNotificationEmail?: string;
  teamNotificationRole?: string;
  extractionFps?: number;
  savedAt: number;
  lastError?: string;
}

const PENDING_SUBMISSION_KEY = 'oneduo_pending_submission';

export function useSubmissionRetry() {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState('');

  /**
   * Save uploaded modules for retry if create-course fails
   */
  const savePendingSubmission = useCallback((submission: Omit<PendingSubmission, 'savedAt'>) => {
    const data: PendingSubmission = {
      ...submission,
      savedAt: Date.now(),
    };
    localStorage.setItem(PENDING_SUBMISSION_KEY, JSON.stringify(data));
    console.log('[SubmissionRetry] Saved pending submission:', data.courseTitle);
  }, []);

  /**
   * Get pending submission if one exists
   */
  const getPendingSubmission = useCallback((): PendingSubmission | null => {
    try {
      const saved = localStorage.getItem(PENDING_SUBMISSION_KEY);
      if (!saved) return null;
      
      const data = JSON.parse(saved) as PendingSubmission;
      
      // Expire after 24 hours
      if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(PENDING_SUBMISSION_KEY);
        return null;
      }
      
      return data;
    } catch {
      return null;
    }
  }, []);

  /**
   * Clear pending submission after successful creation
   */
  const clearPendingSubmission = useCallback(() => {
    localStorage.removeItem(PENDING_SUBMISSION_KEY);
  }, []);

  /**
   * Retry submission with already-uploaded files
   */
  const retrySubmission = useCallback(async (): Promise<{ success: boolean; courseId?: string; error?: string }> => {
    const pending = getPendingSubmission();
    if (!pending) {
      return { success: false, error: 'No pending submission found' };
    }

    setIsRetrying(true);
    setRetryProgress('Submitting course for processing...');

    try {
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'create-course',
          email: pending.email,
          title: pending.courseTitle,
          videoUrl: pending.uploadedModules[0]?.videoUrl,
          isMultiModule: pending.uploadedModules.length > 1,
          modules: pending.uploadedModules.map(m => ({
            ...m,
            useServerExtraction: true,
            videoDurationSeconds: m.durationSeconds,
          })),
          extractionFps: pending.extractionFps || 3,
          sendPerModuleEmails: true,
          integrityVerified: true,
          ...(pending.courseFiles && { courseFiles: pending.courseFiles }),
          ...(pending.teamNotificationEmail && { teamNotificationEmail: pending.teamNotificationEmail }),
          ...(pending.teamNotificationRole && { teamNotificationRole: pending.teamNotificationRole }),
          uploadId: crypto.randomUUID().substring(0, 8),
          isRetrySubmission: true,
        }
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to create course');
      }

      // Success! Clear the pending submission
      clearPendingSubmission();

      toast.success('Course submitted successfully! You\'ll receive emails as modules complete.');

      return {
        success: true,
        courseId: data.courseId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SubmissionRetry] Retry failed:', error);
      
      // Update the pending submission with the new error
      const updated = getPendingSubmission();
      if (updated) {
        savePendingSubmission({ ...updated, lastError: message });
      }

      toast.error(`Retry failed: ${message}`);
      return { success: false, error: message };
    } finally {
      setIsRetrying(false);
      setRetryProgress('');
    }
  }, [getPendingSubmission, clearPendingSubmission, savePendingSubmission]);

  /**
   * Check if videos in pending submission are still accessible
   */
  const validatePendingVideos = useCallback(async (): Promise<boolean> => {
    const pending = getPendingSubmission();
    if (!pending) return false;

    try {
      // Just check if the first video URL is still accessible
      const firstVideo = pending.uploadedModules[0];
      if (!firstVideo?.videoUrl) return false;

      const response = await fetch(firstVideo.videoUrl, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }, [getPendingSubmission]);

  return {
    savePendingSubmission,
    getPendingSubmission,
    clearPendingSubmission,
    retrySubmission,
    validatePendingVideos,
    isRetrying,
    retryProgress,
  };
}
