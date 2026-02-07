import { useCallback, useRef } from 'react';

// Retryable error patterns (same as backend)
const RETRYABLE_ERRORS = [
  'timeout', 'network', '503', '504', '429', 
  'rate limit', 'connection', 'ECONNRESET', 'ETIMEDOUT',
  'fetch failed', 'socket hang up', 'Failed to fetch',
  'Key length is zero', '401', // Edge function cold start
];

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  onGiveUp?: (error: Error, attempts: number) => void;
}

function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return RETRYABLE_ERRORS.some(r => msg.includes(r.toLowerCase()));
}

export function useRetryWithBackoff() {
  const abortRef = useRef(false);
  
  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);
  
  const reset = useCallback(() => {
    abortRef.current = false;
  }, []);

  const executeWithRetry = useCallback(async <T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> => {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      onRetry,
      onGiveUp
    } = options;

    let lastError: Error = new Error('Unknown error');
    abortRef.current = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Check for abort
      if (abortRef.current) {
        throw new Error('Operation aborted');
      }
      
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const retryable = isRetryableError(lastError);

        if (attempt < maxRetries && retryable && !abortRef.current) {
          // Calculate delay with jitter to prevent thundering herd
          const baseDelay = baseDelayMs * Math.pow(2, attempt);
          const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
          const delay = Math.min(baseDelay + jitter, maxDelayMs);
          
          onRetry?.(attempt + 1, lastError, delay);
          
          // Wait with abort check
          await new Promise<void>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              if (abortRef.current) {
                reject(new Error('Operation aborted during retry delay'));
              } else {
                resolve();
              }
            }, delay);
            
            // Allow cleanup
            return () => clearTimeout(timeoutId);
          });
        } else if (!retryable) {
          // Non-retryable error - fail immediately
          onGiveUp?.(lastError, attempt);
          throw lastError;
        }
      }
    }

    // Max retries exhausted
    onGiveUp?.(lastError, maxRetries);
    throw lastError;
  }, []);

  return { executeWithRetry, abort, reset };
}
