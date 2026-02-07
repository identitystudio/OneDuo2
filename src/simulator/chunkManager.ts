/**
 * Chunk Manager - Handles chunk-level retry with exponential backoff
 */

import { ChunkState, EngineConfig, DEFAULT_ENGINE_CONFIG } from './types';

export interface RetryResult {
  shouldRetry: boolean;
  delayMs: number;
  attempt: number;
  maxAttempts: number;
}

export function calculateBackoff(
  retryCount: number,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped)
  const delay = config.baseBackoffMs * Math.pow(2, retryCount);
  return Math.min(delay, config.maxBackoffMs);
}

export function shouldRetryChunk(
  chunk: ChunkState,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): RetryResult {
  const shouldRetry = chunk.retryCount < config.maxRetries;
  const delayMs = shouldRetry ? calculateBackoff(chunk.retryCount, config) : 0;
  
  return {
    shouldRetry,
    delayMs,
    attempt: chunk.retryCount + 1,
    maxAttempts: config.maxRetries + 1,
  };
}

export function createChunkStates(
  fileSize: number,
  chunkSize: number = DEFAULT_ENGINE_CONFIG.chunkSizeBytes
): ChunkState[] {
  const totalChunks = Math.ceil(fileSize / chunkSize);
  const chunks: ChunkState[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const isLastChunk = i === totalChunks - 1;
    const size = isLastChunk 
      ? fileSize - (i * chunkSize) 
      : chunkSize;

    chunks.push({
      chunkNumber: i + 1,
      size,
      status: 'pending',
      retryCount: 0,
    });
  }

  return chunks;
}

export function markChunkCompleted(chunk: ChunkState): ChunkState {
  return {
    ...chunk,
    status: 'completed',
    completedAt: Date.now(),
  };
}

export function markChunkFailed(chunk: ChunkState, error: string): ChunkState {
  return {
    ...chunk,
    status: 'failed',
    error,
  };
}

export function markChunkRetrying(chunk: ChunkState): ChunkState {
  return {
    ...chunk,
    status: 'retrying',
    retryCount: chunk.retryCount + 1,
    error: undefined,
  };
}

export function getNextPendingChunk(chunks: ChunkState[]): ChunkState | null {
  return chunks.find(c => c.status === 'pending' || c.status === 'retrying') || null;
}

export function getCompletedChunkNumbers(chunks: ChunkState[]): number[] {
  return chunks
    .filter(c => c.status === 'completed')
    .map(c => c.chunkNumber);
}

export function restoreChunksFromCheckpoint(
  totalChunks: number,
  completedChunkNumbers: number[],
  fileSize: number,
  chunkSize: number = DEFAULT_ENGINE_CONFIG.chunkSizeBytes
): ChunkState[] {
  const chunks = createChunkStates(fileSize, chunkSize);
  
  for (const chunk of chunks) {
    if (completedChunkNumbers.includes(chunk.chunkNumber)) {
      chunk.status = 'completed';
      chunk.completedAt = Date.now();
    }
  }

  return chunks;
}
