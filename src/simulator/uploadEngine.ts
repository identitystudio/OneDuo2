/**
 * Upload Engine - Core simulation logic for chunked uploads
 * This is the internal engine - UI should NOT import from here directly
 */

import {
  UploadEvent,
  UploadEventType,
  UploadSession,
  ChunkState,
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
  FailureConfig,
  FailureType,
  PersistedSession,
} from './types';
import {
  createChunkStates,
  markChunkCompleted,
  markChunkFailed,
  markChunkRetrying,
  getNextPendingChunk,
  getCompletedChunkNumbers,
  shouldRetryChunk,
  restoreChunksFromCheckpoint,
} from './chunkManager';
import {
  FailureScenarioEngine,
  createFailureEngine,
  setFailureConfig,
  queueManualFailure,
  setNetworkDown,
  checkForFailure,
  getLatencySpike,
} from './failureScenarios';
import {
  saveSession,
  loadSession,
  clearSession,
  updateSessionCheckpoint,
  generateSessionId,
} from './sessionPersistence';

export type EventCallback = (event: UploadEvent) => void;

export interface UploadEngineState {
  session: UploadSession | null;
  chunks: ChunkState[];
  config: EngineConfig;
  failureEngine: FailureScenarioEngine;
  eventLog: UploadEvent[];
  isRunning: boolean;
  isPaused: boolean;
  abortController: AbortController | null;
}

export function createEngineState(config?: Partial<EngineConfig>): UploadEngineState {
  return {
    session: null,
    chunks: [],
    config: { ...DEFAULT_ENGINE_CONFIG, ...config },
    failureEngine: createFailureEngine(),
    eventLog: [],
    isRunning: false,
    isPaused: false,
    abortController: null,
  };
}

function emitEvent(
  state: UploadEngineState,
  type: UploadEventType,
  data: Record<string, unknown>,
  callback?: EventCallback
): UploadEvent {
  const event: UploadEvent = {
    type,
    timestamp: Date.now(),
    data,
  };
  state.eventLog.push(event);
  callback?.(event);
  return event;
}

export async function startUpload(
  state: UploadEngineState,
  file: File,
  callback?: EventCallback
): Promise<{ state: UploadEngineState; sessionId: string }> {
  const sessionId = generateSessionId();
  const totalChunks = Math.ceil(file.size / state.config.chunkSizeBytes);

  const session: UploadSession = {
    sessionId,
    fileName: file.name,
    fileSize: file.size,
    totalChunks,
    uploadedChunks: 0,
    status: 'uploading',
    startedAt: Date.now(),
    canResume: true,
    bytesUploaded: 0,
    currentRetryAttempt: 0,
    totalRetries: 0,
  };

  const chunks = createChunkStates(file.size, state.config.chunkSizeBytes);

  const newState: UploadEngineState = {
    ...state,
    session,
    chunks,
    isRunning: true,
    isPaused: false,
    abortController: new AbortController(),
  };

  // Save initial session for resume capability
  saveSession({
    sessionId,
    fileName: file.name,
    fileSize: file.size,
    totalChunks,
    uploadedChunks: 0,
    checkpointAt: Date.now(),
    status: 'uploading',
    completedChunks: [],
  });

  emitEvent(newState, 'UPLOAD_STARTED', {
    sessionId,
    fileName: file.name,
    fileSize: file.size,
    totalChunks,
  }, callback);

  return { state: newState, sessionId };
}

export async function resumeUpload(
  state: UploadEngineState,
  callback?: EventCallback
): Promise<{ state: UploadEngineState; sessionId: string } | null> {
  const persisted = loadSession();
  if (!persisted) return null;

  const chunks = restoreChunksFromCheckpoint(
    persisted.totalChunks,
    persisted.completedChunks,
    persisted.fileSize,
    state.config.chunkSizeBytes
  );

  const uploadedChunks = persisted.completedChunks.length;
  const bytesUploaded = uploadedChunks * state.config.chunkSizeBytes;

  const session: UploadSession = {
    sessionId: persisted.sessionId,
    fileName: persisted.fileName,
    fileSize: persisted.fileSize,
    totalChunks: persisted.totalChunks,
    uploadedChunks,
    status: 'uploading',
    startedAt: Date.now(),
    canResume: true,
    bytesUploaded,
    currentRetryAttempt: 0,
    totalRetries: 0,
  };

  const newState: UploadEngineState = {
    ...state,
    session,
    chunks,
    isRunning: true,
    isPaused: false,
    abortController: new AbortController(),
  };

  emitEvent(newState, 'RESUMED_FROM_CHECKPOINT', {
    sessionId: persisted.sessionId,
    fromChunk: uploadedChunks,
    totalChunks: persisted.totalChunks,
  }, callback);

  return { state: newState, sessionId: persisted.sessionId };
}

export async function processNextChunk(
  state: UploadEngineState,
  callback?: EventCallback
): Promise<{ state: UploadEngineState; done: boolean }> {
  if (!state.session || !state.isRunning || state.isPaused) {
    return { state, done: true };
  }

  const chunk = getNextPendingChunk(state.chunks);
  if (!chunk) {
    // All chunks completed
    const newSession: UploadSession = {
      ...state.session,
      status: 'completed',
      uploadedChunks: state.session.totalChunks,
      bytesUploaded: state.session.fileSize,
    };

    clearSession();

    const newState = { ...state, session: newSession, isRunning: false };
    
    emitEvent(newState, 'UPLOAD_COMPLETED', {
      sessionId: state.session.sessionId,
      totalTime: Date.now() - state.session.startedAt,
      chunksRetried: state.session.totalRetries,
    }, callback);

    return { state: newState, done: true };
  }

  // Check for failures
  const { engine: updatedFailureEngine, check } = checkForFailure(
    state.failureEngine,
    chunk.chunkNumber,
    state.session.totalChunks
  );

  let newState = { ...state, failureEngine: updatedFailureEngine };

  if (check.shouldFail) {
    // Handle failure
    if (check.failureType === 'network_drop') {
      const newSession: UploadSession = {
        ...state.session,
        status: 'paused',
      };
      newState = { ...newState, session: newSession, isPaused: true };
      
      emitEvent(newState, 'NETWORK_LOST', {
        atPercent: (chunk.chunkNumber / state.session.totalChunks) * 100,
        lastChunk: chunk.chunkNumber,
      }, callback);

      return { state: newState, done: false };
    }

    // Chunk failure - mark and check retry
    const failedChunk = markChunkFailed(chunk, check.message);
    const chunkIndex = newState.chunks.findIndex(c => c.chunkNumber === chunk.chunkNumber);
    newState.chunks = [...newState.chunks];
    newState.chunks[chunkIndex] = failedChunk;

    emitEvent(newState, 'CHUNK_FAILED', {
      chunkNumber: chunk.chunkNumber,
      error: check.message,
      retryCount: failedChunk.retryCount,
    }, callback);

    const retryResult = shouldRetryChunk(failedChunk, state.config);
    
    if (retryResult.shouldRetry) {
      const newSession: UploadSession = {
        ...state.session,
        status: 'retrying',
        currentRetryAttempt: retryResult.attempt,
      };
      newState = { ...newState, session: newSession };

      emitEvent(newState, 'RETRY_SCHEDULED', {
        delayMs: retryResult.delayMs,
        attempt: retryResult.attempt,
        maxAttempts: retryResult.maxAttempts,
      }, callback);

      // Schedule retry
      await new Promise(resolve => setTimeout(resolve, retryResult.delayMs));

      emitEvent(newState, 'RETRY_ATTEMPTED', {
        attempt: retryResult.attempt,
        maxAttempts: retryResult.maxAttempts,
      }, callback);

      // Mark chunk as retrying
      const retryingChunk = markChunkRetrying(failedChunk);
      newState.chunks[chunkIndex] = retryingChunk;
      newState.session = { ...newSession, totalRetries: newSession.totalRetries + 1 };

      return { state: newState, done: false };
    } else {
      // Max retries exceeded - fail upload
      const failedSession: UploadSession = {
        ...state.session,
        status: 'failed',
        canResume: true,
      };
      newState = { ...newState, session: failedSession, isRunning: false };

      emitEvent(newState, 'UPLOAD_FAILED', {
        error: 'Max retries exceeded',
        lastChunk: chunk.chunkNumber,
        canResume: true,
      }, callback);

      return { state: newState, done: true };
    }
  }

  // Simulate chunk upload time
  const baseTime = state.config.baseChunkTimeMs;
  const variance = baseTime * 0.5; // ±50% variance
  const uploadTime = baseTime + (Math.random() * variance * 2 - variance);
  
  // Add latency spike if configured
  const latencySpike = getLatencySpike(state.failureEngine.config);
  if (latencySpike > 0) {
    emitEvent(newState, 'LATENCY_SPIKE', {
      chunkNumber: chunk.chunkNumber,
      additionalMs: latencySpike,
    }, callback);
  }

  await new Promise(resolve => setTimeout(resolve, uploadTime + latencySpike));

  // Mark chunk completed
  const completedChunk = markChunkCompleted(chunk);
  const chunkIndex = newState.chunks.findIndex(c => c.chunkNumber === chunk.chunkNumber);
  newState.chunks = [...newState.chunks];
  newState.chunks[chunkIndex] = completedChunk;

  const uploadedChunks = getCompletedChunkNumbers(newState.chunks).length;
  const bytesUploaded = uploadedChunks * state.config.chunkSizeBytes;

  const updatedSession: UploadSession = {
    ...state.session,
    uploadedChunks,
    bytesUploaded: Math.min(bytesUploaded, state.session.fileSize),
    status: 'uploading',
  };
  newState = { ...newState, session: updatedSession };

  // Update checkpoint
  updateSessionCheckpoint(uploadedChunks, getCompletedChunkNumbers(newState.chunks));

  emitEvent(newState, 'CHUNK_SENT', {
    chunkNumber: chunk.chunkNumber,
    totalChunks: state.session.totalChunks,
    bytesUploaded: updatedSession.bytesUploaded,
  }, callback);

  return { state: newState, done: false };
}

export function pauseUpload(
  state: UploadEngineState,
  callback?: EventCallback
): UploadEngineState {
  if (!state.session || !state.isRunning) return state;

  const newSession: UploadSession = {
    ...state.session,
    status: 'paused',
  };

  const newState = { ...state, session: newSession, isPaused: true };
  
  emitEvent(newState, 'UPLOAD_PAUSED', {
    atChunk: state.session.uploadedChunks,
    totalChunks: state.session.totalChunks,
  }, callback);

  return newState;
}

export function cancelUpload(
  state: UploadEngineState,
  callback?: EventCallback
): UploadEngineState {
  state.abortController?.abort();
  clearSession();

  if (state.session) {
    emitEvent(state, 'UPLOAD_CANCELLED', {
      sessionId: state.session.sessionId,
      atChunk: state.session.uploadedChunks,
    }, callback);
  }

  return createEngineState(state.config);
}

export function restoreNetwork(
  state: UploadEngineState,
  callback?: EventCallback
): UploadEngineState {
  if (!state.session) return state;

  const newFailureEngine = setNetworkDown(state.failureEngine, false);
  const newSession: UploadSession = {
    ...state.session,
    status: 'uploading',
  };

  const newState = {
    ...state,
    session: newSession,
    failureEngine: newFailureEngine,
    isPaused: false,
  };

  emitEvent(newState, 'NETWORK_RESTORED', {
    resumingFrom: state.session.uploadedChunks,
  }, callback);

  return newState;
}

export function updateFailureConfig(
  state: UploadEngineState,
  config: FailureConfig
): UploadEngineState {
  return {
    ...state,
    failureEngine: setFailureConfig(state.failureEngine, config),
  };
}

export function triggerManualFailure(
  state: UploadEngineState,
  type: FailureType
): UploadEngineState {
  if (type === 'browser_refresh') {
    // Simulate browser refresh by just pausing and keeping session
    return pauseUpload(state);
  }

  return {
    ...state,
    failureEngine: queueManualFailure(state.failureEngine, type),
  };
}

export function getPersistedSession(): PersistedSession | null {
  return loadSession();
}
