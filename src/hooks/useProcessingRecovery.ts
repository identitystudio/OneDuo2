import { useCallback } from 'react';

const STORAGE_KEY = 'giftool_processing_state';

export interface ProcessingState {
  jobId: string;
  pendingVideos: Array<{
    id: string;
    type: 'file' | 'url';
    url?: string;
    name: string;
    durationMinutes: number;
  }>;
  currentIndex: number;
  completedIds: string[];
  startedAt: number;
}

export function useProcessingRecovery() {
  const saveState = useCallback((state: ProcessingState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save processing state:', e);
    }
  }, []);

  const loadState = useCallback((): ProcessingState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      
      const state = JSON.parse(saved) as ProcessingState;
      
      // Expire states older than 2 hours
      if (Date.now() - state.startedAt > 2 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      
      return state;
    } catch (e) {
      console.warn('Failed to load processing state:', e);
      return null;
    }
  }, []);

  const clearState = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear processing state:', e);
    }
  }, []);

  const updateState = useCallback((updates: Partial<ProcessingState>) => {
    const current = loadState();
    if (current) {
      saveState({ ...current, ...updates });
    }
  }, [loadState, saveState]);

  return { saveState, loadState, clearState, updateState };
}
