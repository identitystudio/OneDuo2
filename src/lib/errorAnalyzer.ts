// Smart error classification and fix strategy determination
export interface ErrorAnalysis {
  type: 'network' | 'rate_limit' | 'format' | 'api_quota' | 'google_drive' | 'transcription' | 'manual_processing' | 'unknown';
  userMessage: string;
  fixStrategy: string;
  canAutoFix: boolean;
  technicalDetails?: string;
  retryDelay?: number;
}

export function analyzeError(errorMessage?: string, step?: string, status?: string): ErrorAnalysis {
  // Manual review status - positive framing
  if (status === 'manual_review') {
    return {
      type: 'manual_processing',
      userMessage: 'Your content is receiving special attention from our team',
      fixStrategy: "We're on it - you'll receive an email when complete",
      canAutoFix: false, // Not auto-fixable by retry button
      technicalDetails: 'Manual processing by OneDuo team'
    };
  }

  if (!errorMessage) {
    return { 
      type: 'unknown', 
      userMessage: 'An unexpected error occurred', 
      fixStrategy: 'Retry processing', 
      canAutoFix: true 
    };
  }
  
  const msg = errorMessage.toLowerCase();
  
  // Rate limiting
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return {
      type: 'rate_limit',
      userMessage: 'Our servers are busy right now',
      fixStrategy: 'Will wait 60 seconds then retry with longer delays',
      canAutoFix: true,
      retryDelay: 60000,
      technicalDetails: 'API rate limit exceeded'
    };
  }
  
  // Network issues (including Replicate 502 Bad Gateway)
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('econnreset') || msg.includes('bad gateway') || msg.includes('gateway')) {
    return {
      type: 'network',
      userMessage: 'External service temporarily unavailable',
      fixStrategy: 'Will retry automatically with exponential backoff',
      canAutoFix: true,
      retryDelay: 10000,
      technicalDetails: msg.includes('502') || msg.includes('bad gateway') 
        ? 'External service returned 502 Bad Gateway - temporary issue' 
        : 'Network timeout or connection reset'
    };
  }

  // Replicate-specific errors
  if (msg.includes('replicate') || msg.includes('frame extraction failed') || msg.includes('prediction failed')) {
    return {
      type: 'network',
      userMessage: 'Frame extraction service temporarily unavailable',
      fixStrategy: 'Will retry automatically - if issue persists, you can generate with transcript only',
      canAutoFix: true,
      retryDelay: 15000,
      technicalDetails: 'Replicate API error - usually resolves on retry'
    };
  }
  
  // Google Drive specific
  if (msg.includes('google') || msg.includes('drive') || msg.includes('403') || msg.includes('access denied')) {
    return {
      type: 'google_drive',
      userMessage: 'Could not access the video file',
      fixStrategy: 'Make sure the file is publicly accessible (Anyone with link)',
      canAutoFix: false,
      technicalDetails: 'Google Drive file access issue - likely private'
    };
  }
  
  // Format/codec issues
  if (msg.includes('format') || msg.includes('codec') || msg.includes('unsupported') || msg.includes('invalid')) {
    return {
      type: 'format',
      userMessage: 'Video format not supported',
      fixStrategy: 'Try converting to MP4 (H.264) format',
      canAutoFix: false,
      technicalDetails: 'Unsupported video codec or container'
    };
  }
  
  // Transcription issues
  if (msg.includes('transcri') || msg.includes('audio') || msg.includes('assemblyai')) {
    const noAudio = msg.includes('no audio') || msg.includes('silent');
    return {
      type: 'transcription',
      userMessage: noAudio ? 'Video has no audio track' : 'Transcription service issue',
      fixStrategy: noAudio ? 'Will continue with visual-only analysis' : 'Will retry with fallback settings',
      canAutoFix: true,
      retryDelay: 10000,
      technicalDetails: noAudio ? 'Audio track missing or silent' : 'Transcription API error'
    };
  }
  
  // Quota/billing issues
  if (msg.includes('quota') || msg.includes('402') || msg.includes('credits') || msg.includes('billing')) {
    return {
      type: 'api_quota',
      userMessage: 'Processing quota temporarily reached',
      fixStrategy: 'Contact support for assistance',
      canAutoFix: false,
      technicalDetails: 'API billing or quota limit reached'
    };
  }
  
  return { 
    type: 'unknown', 
    userMessage: errorMessage.slice(0, 100), 
    fixStrategy: "We'll try a different approach", 
    canAutoFix: true,
    retryDelay: 5000
  };
}

// Determine fix strategy based on error type and attempt count
export function getFixStrategy(errorType: string, attemptCount: number): {
  shouldRetry: boolean;
  modifications: Record<string, any>;
  delayMs: number;
} {
  switch (errorType) {
    case 'rate_limit':
      return {
        shouldRetry: attemptCount < 5,
        modifications: { 
          extendedDelay: true,
          batchSize: Math.max(1, 5 - attemptCount) // Reduce batch size with each retry
        },
        delayMs: 60000 * attemptCount // 1min, 2min, 3min...
      };
      
    case 'network':
      return {
        shouldRetry: attemptCount < 4,
        modifications: { 
          extendedTimeout: true,
          timeoutMultiplier: 1 + attemptCount * 0.5 // 1.5x, 2x, 2.5x...
        },
        delayMs: 5000 * attemptCount
      };
      
    case 'transcription':
      return {
        shouldRetry: attemptCount < 2,
        modifications: { 
          skipTranscription: attemptCount >= 1, // Skip on second try
          visualOnly: true
        },
        delayMs: 10000
      };
      
    case 'google_drive':
    case 'format':
    case 'api_quota':
      return {
        shouldRetry: false,
        modifications: {},
        delayMs: 0
      };
      
    default:
      return {
        shouldRetry: attemptCount < 3,
        modifications: {},
        delayMs: 5000 * attemptCount
      };
  }
}