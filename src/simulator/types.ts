/**
 * Upload Reliability Simulator - Type Definitions
 * Sandbox-only implementation for testing upload resilience
 */

// Event types emitted during upload simulation
export type UploadEventType =
  | 'UPLOAD_STARTED'
  | 'CHUNK_SENT'
  | 'CHUNK_FAILED'
  | 'NETWORK_LOST'
  | 'NETWORK_RESTORED'
  | 'RETRY_SCHEDULED'
  | 'RETRY_ATTEMPTED'
  | 'RESUMED_FROM_CHECKPOINT'
  | 'UPLOAD_COMPLETED'
  | 'UPLOAD_FAILED'
  | 'UPLOAD_PAUSED'
  | 'UPLOAD_CANCELLED'
  | 'STALL_DETECTED'
  | 'STALL_RECOVERED'
  | 'LATENCY_SPIKE';

export interface UploadEvent {
  type: UploadEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

// Failure simulation types
export type FailureType = 
  | 'network_drop' 
  | 'chunk_failure' 
  | 'latency_spike' 
  | 'browser_refresh';

export interface FailureConfig {
  networkDropAtPercent?: number;      // Drop network at X% progress
  chunkFailureEveryN?: number;        // Fail every N chunks
  latencySpikeMs?: number;            // Add random latency spikes (max additional ms)
  simulateBrowserRefresh?: boolean;   // Simulate mid-upload refresh
}

// Upload session state
export type UploadStatus = 
  | 'idle' 
  | 'uploading' 
  | 'retrying' 
  | 'paused' 
  | 'completed' 
  | 'failed';

export interface UploadSession {
  sessionId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  uploadedChunks: number;
  status: UploadStatus;
  startedAt: number;
  canResume: boolean;
  bytesUploaded: number;
  currentRetryAttempt: number;
  totalRetries: number;
}

// Chunk-level tracking
export interface ChunkState {
  chunkNumber: number;
  size: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'retrying';
  retryCount: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// Session persistence for resume capability
export interface PersistedSession {
  sessionId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  uploadedChunks: number;
  checkpointAt: number;
  status: 'paused' | 'uploading';
  completedChunks: number[];
}

// Engine configuration
export interface EngineConfig {
  chunkSizeBytes: number;          // Default 5MB
  baseChunkTimeMs: number;         // Base time per chunk (100-300ms)
  maxRetries: number;              // Max retries per chunk
  baseBackoffMs: number;           // Base backoff time (1000ms)
  maxBackoffMs: number;            // Max backoff time (16000ms)
  stallDetectionMs: number;        // Time before considering upload stalled
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  chunkSizeBytes: 5 * 1024 * 1024, // 5MB
  baseChunkTimeMs: 150,            // 150ms average
  maxRetries: 4,                   // 4 retries = 5 total attempts
  baseBackoffMs: 1000,             // 1 second
  maxBackoffMs: 16000,             // 16 seconds max
  stallDetectionMs: 30000,         // 30 seconds
};
