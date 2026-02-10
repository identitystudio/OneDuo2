/**
 * Batch Upload Hook
 * Handles multi-module uploads with background processing
 * User can close tab after upload - receives emails as modules complete
 * 
 * PRODUCTION HARDENING:
 * - Saves uploaded video URLs before create-course (so submission can be retried without re-upload)
 * - Pre-flight checks verify services are ready
 * - Video integrity verification before queueing
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useResumableUpload } from '../useResumableUpload';
import { useChunkedUpload, needsChunkedUpload } from '../useChunkedUpload';
import { useSubmissionRetry } from '../useSubmissionRetry';
import { runPreflightCheck } from './preflightCheck';
import { verifyVideoIntegrity } from './verifyIntegrity';
import { 
  MAX_CONCURRENT_JOBS, 
  DEFAULT_EXTRACTION_FPS, 
  SESSION_STORAGE_KEY, 
  EMAIL_STORAGE_KEY, 
  JUST_UPLOADED_KEY 
} from './constants';
import type { 
  BatchModule, 
  BatchProgress, 
  BatchSubmitResult, 
  BatchSubmitOptions,
  ModuleUploadProgress,
  UploadedModule 
} from './types';

// Re-export types for external consumers
export * from './types';
export { runPreflightCheck } from './preflightCheck';

export function useBatchUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({
    stage: 'idle',
    totalModules: 0,
    uploadedModules: 0,
    currentModuleIndex: 0,
    currentModuleProgress: 0,
    currentModuleUploadDetails: null,
    message: 'Ready',
    canClose: false
  });
  
  const abortRef = useRef(false);
  const isUploadingRef = useRef(false);
  const { uploadFile: resumableUpload, progress: uploadProgress } = useResumableUpload();
  const { uploadFile: chunkedUpload, progress: chunkedProgress } = useChunkedUpload();
  const { savePendingSubmission, clearPendingSubmission, getPendingSubmission, retrySubmission, isRetrying } = useSubmissionRetry();

  // Keep ref in sync with state
  useEffect(() => {
    isUploadingRef.current = progress.stage === 'uploading';
  }, [progress.stage]);

  // Sync upload progress from useResumableUpload or useChunkedUpload to batch progress
  useEffect(() => {
    if (!isUploadingRef.current) return;
    
    // Check chunked upload progress first (for large files)
    const activeProgress = chunkedProgress.phase !== 'preparing' ? chunkedProgress : uploadProgress;
    
    const hasProgress = activeProgress.percentage > 0 || activeProgress.bytesUploaded > 0;
    const isActive = activeProgress.phase === 'uploading' || activeProgress.phase === 'preparing' || activeProgress.phase === 'merging';
    
    if (hasProgress || isActive) {
      console.log('[BatchUpload] Syncing progress:', activeProgress.percentage, '% phase:', activeProgress.phase);
      setProgress(prev => {
        if (prev.stage !== 'uploading') return prev;
        return {
          ...prev,
          currentModuleProgress: activeProgress.percentage,
          currentModuleUploadDetails: {
            percentage: activeProgress.percentage,
            bytesUploaded: activeProgress.bytesUploaded,
            totalBytes: activeProgress.totalBytes,
            speed: activeProgress.speed,
            timeRemaining: activeProgress.timeRemaining,
          }
        };
      });
    }
  }, [
    uploadProgress.phase,
    uploadProgress.percentage,
    uploadProgress.bytesUploaded,
    uploadProgress.totalBytes,
    uploadProgress.speed,
    uploadProgress.timeRemaining,
    chunkedProgress.phase,
    chunkedProgress.percentage,
    chunkedProgress.bytesUploaded,
    chunkedProgress.totalBytes,
    chunkedProgress.speed,
    chunkedProgress.timeRemaining,
  ]);

  /**
   * Upload a single video file using TUS resumable upload protocol
   * For files >4.5GB, automatically uses chunked upload instead
   */
  const isTusSizeLimitError = (err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.includes('response code: 413') ||
      message.includes('Maximum size exceeded') ||
      message.includes('Payload Too Large') ||
      (message.includes('/storage/v1/upload/resumable') && message.includes('413'))
    );
  };

  const uploadSingleFile = async (file: File): Promise<string> => {
    if (needsChunkedUpload(file)) {
      console.log(`[BatchUpload] File ${file.name} (${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB) requires chunked upload`);
      return await chunkedUpload(file);
    }

    try {
      return await resumableUpload(file);
    } catch (err) {
      // If TUS rejects with 413, transparently fall back to the large-file path.
      if (isTusSizeLimitError(err)) {
        console.warn('[BatchUpload] TUS size limit hit; falling back to chunked upload.', {
          fileName: file.name,
          fileSize: file.size,
          error: err instanceof Error ? err.message : String(err),
        });
        return await chunkedUpload(file);
      }
      throw err;
    }
  };

  /**
   * Initialize progress state for immediate UI feedback
   */
  const initializeProgress = useCallback((totalModules: number, hasDocumentsOnly: boolean = false) => {
    setProgress({
      stage: 'uploading',
      totalModules,
      uploadedModules: 0,
      currentModuleIndex: 0,
      currentModuleProgress: 0,
      currentModuleUploadDetails: null,
      message: hasDocumentsOnly ? 'Processing documents...' : 'Starting upload...',
      canClose: false
    });
  }, []);

  /**
   * Submit a batch of modules for processing
   */
  const submitBatch = useCallback(async (
    modules: BatchModule[],
    email: string,
    courseTitle: string,
    options?: BatchSubmitOptions
  ): Promise<BatchSubmitResult> => {
    const hasDocuments = options?.courseFiles && options.courseFiles.length > 0;
    if (modules.length === 0 && !hasDocuments) {
      return { success: false, error: 'No modules or documents to upload' };
    }

    setIsUploading(true);
    abortRef.current = false;

    const sessionId = localStorage.getItem(SESSION_STORAGE_KEY) || crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);

    try {
      // Phase 0: Pre-flight check
      setProgress({
        stage: 'uploading',
        totalModules: modules.length,
        uploadedModules: 0,
        currentModuleIndex: 0,
        currentModuleProgress: 0,
        currentModuleUploadDetails: null,
        message: 'Running pre-flight checks...',
        canClose: false
      });

      const preflight = await runPreflightCheck();
      if (!preflight.ready) {
        const issueList = preflight.issues.join(', ');
        console.error('[BatchUpload] Pre-flight failed:', issueList);
        toast.error(`Cannot start upload: ${issueList}`);
        throw new Error(`Pre-flight check failed: ${issueList}`);
      }

      console.log('[BatchUpload] Pre-flight check passed - all systems ready');

      // Phase 1: Upload all video files
      setProgress(prev => ({
        ...prev,
        message: `Uploading ${modules.length} videos...`
      }));

      const uploadedModules: UploadedModule[] = [];
      const verificationWarnings: string[] = [];

      for (let i = 0; i < modules.length; i++) {
        if (abortRef.current) {
          throw new Error('Upload cancelled');
        }

        const module = modules[i];
        
        setProgress(prev => ({
          ...prev,
          currentModuleIndex: i,
          currentModuleProgress: 0,
          message: `Uploading video ${i + 1}/${modules.length}: ${module.title || module.file.name}`
        }));

        console.log(`[BatchUpload] Uploading module ${i + 1}/${modules.length}: ${module.file.name}`);
        
        try {
          const videoUrl = await uploadSingleFile(module.file);
          
          // Handle sub-videos and attachments
          const subVideoAttachments = module.attachments?.filter(a => a.type === 'video') || [];
          const documentAttachments = module.attachments?.filter(a => a.type !== 'video') || [];
          
          let sourceVideos: UploadedModule['sourceVideos'] = [{
            url: videoUrl,
            filename: module.file.name,
            order: 0,
          }];
          
          // Upload sub-videos
          if (subVideoAttachments.length > 0) {
            setProgress(prev => ({
              ...prev,
              message: `Uploading sub-videos for module ${i + 1}...`
            }));
            
            for (let subIdx = 0; subIdx < subVideoAttachments.length; subIdx++) {
              const subVideo = subVideoAttachments[subIdx];
              try {
                const subVideoUrl = await uploadSingleFile(subVideo.file);
                sourceVideos.push({
                  url: subVideoUrl,
                  filename: subVideo.file.name,
                  order: subIdx + 1,
                });
                console.log(`[BatchUpload] Uploaded sub-video ${subIdx + 1} for module ${i + 1}: ${subVideo.file.name}`);
              } catch (e) {
                throw new Error(`Failed to upload sub-video \"${subVideo.name}\": ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }
          }
          
          // Upload module-level document files
          let moduleFileUrls: { name: string; storagePath: string; size: number }[] = [];
          if (documentAttachments.length > 0) {
            setProgress(prev => ({
              ...prev,
              message: `Uploading files for module ${i + 1}...`
            }));
            
            for (const attachment of documentAttachments) {
              try {
                const storagePath = `module-files/${crypto.randomUUID()}/${attachment.file.name}`;
                const { error } = await supabase.storage
                  .from('course-files')
                  .upload(storagePath, attachment.file);
                
                if (!error) {
                  moduleFileUrls.push({
                    name: attachment.name,
                    storagePath,
                    size: attachment.size
                  });
                }
              } catch (e) {
                console.warn('[BatchUpload] Failed to upload module file:', attachment.name, e);
              }
            }
          }
          
          // Verify video integrity (skip for audio files)
          if (!options?.skipIntegrityCheck && !module.isAudio) {
            setProgress(prev => ({
              ...prev,
              message: `Verifying video ${i + 1}/${modules.length}...`
            }));

            const verification = await verifyVideoIntegrity(videoUrl);
            
            if (!verification.valid) {
              throw new Error(`Video \"${module.title || module.file.name}\" failed integrity check: ${verification.error || 'Unknown error'}`);
            }

            if (verification.warnings?.length) {
              verificationWarnings.push(...verification.warnings.map(w => `${module.title}: ${w}`));
            }

            const requiresStitching = sourceVideos.length > 1;
            
            uploadedModules.push({
              title: module.title || module.file.name.replace(/\.[^/.]+$/, ''),
              videoUrl,
              moduleNumber: i + 1,
              durationSeconds: verification.duration,
              ...(module.isAudio && { isAudio: true }),
              ...(moduleFileUrls.length > 0 && { moduleFiles: moduleFileUrls }),
              ...(requiresStitching && { sourceVideos, requiresStitching: true })
            });
          } else {
            const requiresStitching = sourceVideos.length > 1;
            
            uploadedModules.push({
              title: module.title || module.file.name.replace(/\.[^/.]+$/, ''),
              videoUrl,
              moduleNumber: i + 1,
              ...(module.isAudio && { isAudio: true }),
              ...(moduleFileUrls.length > 0 && { moduleFiles: moduleFileUrls }),
              ...(requiresStitching && { sourceVideos, requiresStitching: true })
            });
          }

          setProgress(prev => ({
            ...prev,
            uploadedModules: i + 1,
            currentModuleProgress: 0,
            message: `Uploaded ${i + 1}/${modules.length} videos`
          }));

          console.log(`[BatchUpload] Module ${i + 1} uploaded and verified successfully`);
        } catch (uploadErr) {
          console.error(`[BatchUpload] Failed to upload module ${i + 1}:`, uploadErr);
          throw new Error(`Failed to upload \"${module.title || module.file.name}\": ${uploadErr instanceof Error ? uploadErr.message : 'Unknown error'}`);
        }
      }

      // Show verification warnings
      if (verificationWarnings.length > 0) {
        console.warn('[BatchUpload] Verification warnings:', verificationWarnings);
        toast.warning(`Upload complete with warnings: ${verificationWarnings.slice(0, 2).join('; ')}`);
      }

      // Save submission data for retry
      const submissionData = {
        courseTitle,
        email,
        uploadedModules,
        courseFiles: options?.courseFiles,
        teamNotificationEmail: options?.teamNotificationEmail,
        teamNotificationRole: options?.teamNotificationRole,
        extractionFps: options?.extractionFps ?? DEFAULT_EXTRACTION_FPS,
      };
      savePendingSubmission(submissionData);
      console.log('[BatchUpload] Saved submission data for potential retry');

      // Phase 2: Submit to backend
      setProgress(prev => ({
        ...prev,
        stage: 'submitted',
        canClose: true,
        message: 'All videos uploaded! Submitting for processing...'
      }));

      const batchId = crypto.randomUUID();
      let data: any;
      let error: any;

      if (options?.existingCourseId) {
        console.log(`[BatchUpload] Adding ${modules.length} modules to existing course ${options.existingCourseId}...`);
        
        const result = await supabase.functions.invoke('process-course', {
          body: {
            action: 'add-modules',
            courseId: options.existingCourseId,
            email,
            modules: uploadedModules.map(m => ({
              title: m.title,
              videoUrl: m.videoUrl,
              durationSeconds: m.durationSeconds,
              moduleFiles: m.moduleFiles,
            })),
          }
        });
        data = result.data;
        error = result.error;
      } else {
        console.log(`[BatchUpload] All ${modules.length} videos uploaded. Creating course...`);
        
        const result = await supabase.functions.invoke('process-course', {
          body: {
            action: 'create-course',
            email,
            title: courseTitle,
            videoUrl: uploadedModules[0].videoUrl,
            isMultiModule: uploadedModules.length > 1,
            modules: uploadedModules.map(m => ({
              ...m,
              useServerExtraction: true,
              videoDurationSeconds: m.durationSeconds,
              isAudio: m.isAudio || false,
            })),
            extractionFps: options?.extractionFps ?? DEFAULT_EXTRACTION_FPS,
            batchId,
            sendPerModuleEmails: !options?.mergedCourseMode,
            mergedCourseMode: options?.mergedCourseMode || false,
            integrityVerified: !options?.skipIntegrityCheck,
            ...(options?.courseFiles && { courseFiles: options.courseFiles }),
            ...(options?.teamNotificationEmail && { teamNotificationEmail: options.teamNotificationEmail }),
            ...(options?.teamNotificationRole && { teamNotificationRole: options.teamNotificationRole }),
            uploadId: crypto.randomUUID().substring(0, 8)
          }
        });
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('[BatchUpload] Submit failed, submission saved for retry:', error);
        throw error;
      }

      if (!data?.success) {
        console.error('[BatchUpload] Submit returned failure, submission saved for retry');
        throw new Error(data?.error || 'Failed to submit');
      }

      clearPendingSubmission();

      const isAddingToExisting = !!options?.existingCourseId;
      const successMessage = isAddingToExisting
        ? `Success! ${modules.length} module${modules.length > 1 ? 's' : ''} added. You'll receive emails as each completes.`
        : `Success! ${modules.length} modules submitted. You'll receive emails as each completes.`;

      setProgress({
        stage: 'complete',
        totalModules: modules.length,
        uploadedModules: modules.length,
        currentModuleIndex: modules.length - 1,
        currentModuleProgress: 100,
        currentModuleUploadDetails: null,
        message: successMessage,
        canClose: true
      });

      console.log(`[BatchUpload] ${isAddingToExisting ? 'Added modules to' : 'Created'} course: ${data.courseId}, Batch: ${batchId}`);

      localStorage.setItem(EMAIL_STORAGE_KEY, email);
      localStorage.setItem(JUST_UPLOADED_KEY, JSON.stringify({
        courseTitle,
        timestamp: Date.now(),
        isNewCourse: !isAddingToExisting,
        moduleCount: modules.length,
        batchId
      }));

      const toastMessage = isAddingToExisting
        ? `${modules.length} module${modules.length > 1 ? 's' : ''} added! We'll email you as each is ready.`
        : `${modules.length} modules submitted! You can close this tab now. We'll email you as each module is ready.`;
      
      toast.success(toastMessage);

      return {
        success: true,
        courseId: data.courseId,
        batchId
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BatchUpload] Failed:', error);
      
      setProgress(prev => ({
        ...prev,
        stage: 'error',
        message: `Error: ${message}`,
        canClose: true
      }));

      return {
        success: false,
        error: message
      };
    } finally {
      setIsUploading(false);
    }
  }, [resumableUpload, chunkedUpload, savePendingSubmission, clearPendingSubmission]);

  /**
   * Cancel ongoing uploads
   */
  const cancel = useCallback(() => {
    abortRef.current = true;
    setProgress(prev => ({
      ...prev,
      message: 'Cancelling...',
      canClose: true
    }));
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setProgress({
      stage: 'idle',
      totalModules: 0,
      uploadedModules: 0,
      currentModuleIndex: 0,
      currentModuleProgress: 0,
      currentModuleUploadDetails: null,
      message: 'Ready',
      canClose: false
    });
    abortRef.current = false;
  }, []);

  return {
    submitBatch,
    isUploading,
    progress,
    cancel,
    reset,
    initializeProgress,
    runPreflightCheck,
    maxConcurrentJobs: MAX_CONCURRENT_JOBS,
    getPendingSubmission,
    retrySubmission,
    isRetrying,
  };
}
