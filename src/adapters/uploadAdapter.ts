/**
 * Upload Adapter - Clean interface for UI components
 * UI components should ONLY import from this file, never from simulator internals
 */

import {
  UploadEvent,
  UploadEventType,
  UploadSession,
  FailureConfig,
  FailureType,
} from '@/simulator/types';
import {
  UploadEngineState,
  createEngineState,
  startUpload as engineStartUpload,
  resumeUpload as engineResumeUpload,
  processNextChunk,
  pauseUpload as enginePauseUpload,
  cancelUpload as engineCancelUpload,
  restoreNetwork,
  updateFailureConfig,
  triggerManualFailure,
  getPersistedSession,
  EventCallback,
} from '@/simulator/uploadEngine';

// Re-export types for UI consumption
export type { UploadEvent, UploadEventType, UploadSession, FailureConfig, FailureType };

export interface UploadAdapter {
  startUpload(file: File): Promise<string>;
  resumeUpload(): Promise<string | null>;
  pauseUpload(): void;
  cancelUpload(): void;
  restoreNetwork(): void;
  simulateFailure(type: FailureType): void;
  setFailureConfig(config: FailureConfig): void;
  onEvent(callback: (event: UploadEvent) => void): () => void;
  getSession(): UploadSession | null;
  getEventLog(): UploadEvent[];
  hasResumableSession(): boolean;
  reset(): void;
}

export function createUploadAdapter(): UploadAdapter {
  let state: UploadEngineState = createEngineState();
  let eventCallbacks: Set<EventCallback> = new Set();
  let uploadLoopRunning = false;

  const notifyEvent = (event: UploadEvent) => {
    eventCallbacks.forEach(cb => cb(event));
  };

  const runUploadLoop = async () => {
    if (uploadLoopRunning) return;
    uploadLoopRunning = true;

    while (state.isRunning && !state.isPaused) {
      const result = await processNextChunk(state, notifyEvent);
      state = result.state;
      
      if (result.done) break;
      
      // Small delay between chunks for UI responsiveness
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    uploadLoopRunning = false;
  };

  return {
    async startUpload(file: File): Promise<string> {
      const result = await engineStartUpload(state, file, notifyEvent);
      state = result.state;
      
      // Start the upload loop
      runUploadLoop();
      
      return result.sessionId;
    },

    async resumeUpload(): Promise<string | null> {
      const result = await engineResumeUpload(state, notifyEvent);
      if (!result) return null;
      
      state = result.state;
      
      // Start the upload loop
      runUploadLoop();
      
      return result.sessionId;
    },

    pauseUpload(): void {
      state = enginePauseUpload(state, notifyEvent);
    },

    cancelUpload(): void {
      state = engineCancelUpload(state, notifyEvent);
    },

    restoreNetwork(): void {
      state = restoreNetwork(state, notifyEvent);
      // Resume upload loop
      runUploadLoop();
    },

    simulateFailure(type: FailureType): void {
      state = triggerManualFailure(state, type);
    },

    setFailureConfig(config: FailureConfig): void {
      state = updateFailureConfig(state, config);
    },

    onEvent(callback: (event: UploadEvent) => void): () => void {
      eventCallbacks.add(callback);
      return () => {
        eventCallbacks.delete(callback);
      };
    },

    getSession(): UploadSession | null {
      return state.session;
    },

    getEventLog(): UploadEvent[] {
      return [...state.eventLog];
    },

    hasResumableSession(): boolean {
      return getPersistedSession() !== null;
    },

    reset(): void {
      state = createEngineState();
      eventCallbacks.clear();
      uploadLoopRunning = false;
    },
  };
}

// Singleton adapter instance for the application
let adapterInstance: UploadAdapter | null = null;

export function getUploadAdapter(): UploadAdapter {
  if (!adapterInstance) {
    adapterInstance = createUploadAdapter();
  }
  return adapterInstance;
}

export function resetUploadAdapter(): void {
  adapterInstance?.reset();
  adapterInstance = null;
}
