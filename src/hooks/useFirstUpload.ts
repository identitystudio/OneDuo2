/**
 * First Upload Tracking Hook
 * Tracks whether this is the user's first successful upload for special celebration
 */

import { useCallback, useState, useEffect } from 'react';

const STORAGE_KEY = 'oneduo_first_upload_completed';

export function useFirstUpload() {
  const [isFirstUpload, setIsFirstUpload] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  // Check on mount if this would be their first upload
  useEffect(() => {
    const hasCompletedBefore = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsFirstUpload(!hasCompletedBefore);
    setHasChecked(true);
  }, []);

  // Mark first upload as complete
  const markFirstUploadComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsFirstUpload(false);
  }, []);

  // Reset for testing purposes
  const resetFirstUpload = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsFirstUpload(true);
  }, []);

  return {
    isFirstUpload,
    hasChecked,
    markFirstUploadComplete,
    resetFirstUpload,
  };
}
