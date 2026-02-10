/**
 * Batch Upload Types
 * Shared type definitions for batch upload functionality
 */

export interface BatchModuleAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  type?: 'document' | 'video' | 'audio';
}

export interface BatchModule {
  id: string;
  title: string;
  file: File;
  status: 'pending' | 'uploading' | 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
  attachments?: BatchModuleAttachment[];
  subVideos?: BatchModuleAttachment[];
  isAudio?: boolean;
}

export interface ModuleUploadProgress {
  percentage: number;
  bytesUploaded: number;
  totalBytes: number;
  speed: string;
  timeRemaining: string;
}

export interface BatchProgress {
  stage: 'idle' | 'uploading' | 'submitted' | 'complete' | 'error';
  totalModules: number;
  uploadedModules: number;
  currentModuleIndex: number;
  currentModuleProgress: number;
  currentModuleUploadDetails: ModuleUploadProgress | null;
  message: string;
  canClose: boolean;
}

export interface BatchSubmitResult {
  success: boolean;
  courseId?: string;
  batchId?: string;
  error?: string;
}

export interface BatchSubmitOptions {
  extractionFps?: number;
  teamNotificationEmail?: string;
  teamNotificationRole?: string;
  skipIntegrityCheck?: boolean;
  courseFiles?: { name: string; storagePath: string; size: number }[];
  existingCourseId?: string;
  mergedCourseMode?: boolean;
}

export interface UploadedModule {
  title: string;
  videoUrl: string;
  moduleNumber: number;
  durationSeconds?: number;
  moduleFiles?: { name: string; storagePath: string; size: number }[];
  sourceVideos?: { 
    url: string; 
    filename: string; 
    order: number; 
    duration_seconds?: number; 
    storage_path?: string; 
  }[];
  requiresStitching?: boolean;
  isAudio?: boolean;
}

export interface PreflightResult {
  ready: boolean;
  issues: string[];
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  duration?: number;
  warnings?: string[];
}
