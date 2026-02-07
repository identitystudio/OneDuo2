/**
 * Upload Persistence Hook
 * Tracks multiple concurrent uploads and allows recovery of truly interrupted ones
 */

import { useCallback, useEffect, useState } from 'react';

export interface ActiveUploadState {
  id: string; // Unique upload session ID
  courseTitle: string;
  email: string;
  files: {
    id: string;
    name: string;
    size: number;
    attachmentCount: number;
  }[];
  startedAt: number;
  stage: 'uploading' | 'submitted';
  uploadedModules: number;
  totalModules: number;
  tabId: string; // To track which tab owns this upload
}

// Legacy type for backwards compatibility
export type PersistedUploadState = Omit<ActiveUploadState, 'id' | 'tabId'>;

const STORAGE_KEY = 'courseagent_active_uploads';
const TAB_ID_KEY = 'courseagent_tab_id';

// Generate a unique tab ID for this browser session
function getTabId(): string {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

// Get all active uploads from localStorage
function getActiveUploads(): ActiveUploadState[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as ActiveUploadState[];
  } catch {
    return [];
  }
}

// Save all active uploads to localStorage
function saveActiveUploads(uploads: ActiveUploadState[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
}

export function useUploadPersistence() {
  const [activeUploads, setActiveUploads] = useState<ActiveUploadState[]>([]);
  const [interruptedUploads, setInterruptedUploads] = useState<ActiveUploadState[]>([]);
  const currentTabId = getTabId();

  // Load and check for interrupted uploads on mount
  useEffect(() => {
    const uploads = getActiveUploads();
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    
    // Filter out old uploads (>24 hours) and find interrupted ones
    const validUploads: ActiveUploadState[] = [];
    const interrupted: ActiveUploadState[] = [];
    
    for (const upload of uploads) {
      const age = now - upload.startedAt;
      
      // Skip uploads older than 24 hours
      if (age > 24 * hourMs) continue;
      
      // If this tab owns the upload, it's still active
      if (upload.tabId === currentTabId) {
        validUploads.push(upload);
        continue;
      }
      
      // If upload is from another tab and seems stale (>30 min since last update),
      // it's likely interrupted
      if (age > 30 * 60 * 1000 && upload.stage === 'uploading') {
        interrupted.push(upload);
      } else {
        // Keep it as active - might be in another tab
        validUploads.push(upload);
      }
    }
    
    // Save cleaned up list
    saveActiveUploads(validUploads);
    setActiveUploads(validUploads);
    setInterruptedUploads(interrupted);
  }, [currentTabId]);

  // Create a new upload session
  const createUploadSession = useCallback((state: Omit<ActiveUploadState, 'id' | 'tabId'>): string => {
    const id = crypto.randomUUID();
    const newUpload: ActiveUploadState = {
      ...state,
      id,
      tabId: currentTabId,
    };
    
    const uploads = getActiveUploads();
    uploads.push(newUpload);
    saveActiveUploads(uploads);
    setActiveUploads(uploads);
    
    return id;
  }, [currentTabId]);

  // Update an upload session's progress
  const updateUploadSession = useCallback((uploadId: string, updates: Partial<Pick<ActiveUploadState, 'uploadedModules' | 'stage'>>) => {
    const uploads = getActiveUploads();
    const index = uploads.findIndex(u => u.id === uploadId);
    
    if (index !== -1) {
      uploads[index] = { ...uploads[index], ...updates };
      saveActiveUploads(uploads);
      setActiveUploads(uploads);
    }
  }, []);

  // Remove an upload session (on success or user dismissal)
  const removeUploadSession = useCallback((uploadId: string) => {
    const uploads = getActiveUploads().filter(u => u.id !== uploadId);
    saveActiveUploads(uploads);
    setActiveUploads(uploads);
  }, []);

  // Clear all uploads for this tab (legacy compatibility)
  const clearUploadState = useCallback(() => {
    const uploads = getActiveUploads().filter(u => u.tabId !== currentTabId);
    saveActiveUploads(uploads);
    setActiveUploads(uploads);
  }, [currentTabId]);

  // Dismiss interrupted uploads without clearing active ones
  const dismissInterrupted = useCallback((uploadId?: string) => {
    if (uploadId) {
      // Remove specific interrupted upload
      const uploads = getActiveUploads().filter(u => u.id !== uploadId);
      saveActiveUploads(uploads);
      setInterruptedUploads(prev => prev.filter(u => u.id !== uploadId));
    } else {
      // Remove all interrupted uploads
      const currentTabUploads = getActiveUploads().filter(u => u.tabId === currentTabId);
      saveActiveUploads(currentTabUploads);
      setInterruptedUploads([]);
    }
  }, [currentTabId]);

  // Legacy API compatibility
  const saveUploadState = useCallback((state: PersistedUploadState): string => {
    return createUploadSession(state);
  }, [createUploadSession]);

  const updateUploadProgress = useCallback((uploadedModules: number, stage: 'uploading' | 'submitted') => {
    // Update the most recent upload for this tab
    const uploads = getActiveUploads();
    const myUploads = uploads.filter(u => u.tabId === currentTabId);
    
    if (myUploads.length > 0) {
      const latest = myUploads[myUploads.length - 1];
      updateUploadSession(latest.id, { uploadedModules, stage });
    }
  }, [currentTabId, updateUploadSession]);

  const dismissRecovery = useCallback(() => {
    dismissInterrupted();
  }, [dismissInterrupted]);

  // Get pending upload (first interrupted one) for legacy compatibility
  const pendingUpload = interruptedUploads.length > 0 ? interruptedUploads[0] : null;

  // Get count of active uploads (across all tabs)
  const activeUploadCount = activeUploads.length;

  return {
    // New multi-upload API
    activeUploads,
    interruptedUploads,
    createUploadSession,
    updateUploadSession,
    removeUploadSession,
    dismissInterrupted,
    activeUploadCount,
    currentTabId, // Expose current tab ID for filtering
    
    // Legacy API (backwards compatible)
    pendingUpload,
    saveUploadState,
    updateUploadProgress,
    clearUploadState,
    dismissRecovery,
  };
}
