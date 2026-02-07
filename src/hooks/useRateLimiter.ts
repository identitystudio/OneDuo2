import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  showToast?: boolean;
}

interface RateLimitState {
  requests: number[];
}

/**
 * Client-side rate limiter hook for API calls
 * Prevents excessive requests and provides user feedback
 */
export function useRateLimiter(config: RateLimitConfig = { maxRequests: 10, windowMs: 60000, showToast: true }) {
  const stateRef = useRef<RateLimitState>({ requests: [] });

  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Clean old requests outside window
    stateRef.current.requests = stateRef.current.requests.filter(t => t > windowStart);
    
    if (stateRef.current.requests.length >= config.maxRequests) {
      if (config.showToast) {
        const waitTime = Math.ceil((stateRef.current.requests[0] + config.windowMs - now) / 1000);
        toast.error(`Rate limit reached. Please wait ${waitTime}s before trying again.`);
      }
      return false;
    }
    
    stateRef.current.requests.push(now);
    return true;
  }, [config.maxRequests, config.windowMs, config.showToast]);

  const getRemainingRequests = useCallback((): number => {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    stateRef.current.requests = stateRef.current.requests.filter(t => t > windowStart);
    return Math.max(0, config.maxRequests - stateRef.current.requests.length);
  }, [config.maxRequests, config.windowMs]);

  const getResetTime = useCallback((): number => {
    if (stateRef.current.requests.length === 0) return 0;
    const oldestRequest = stateRef.current.requests[0];
    return Math.max(0, oldestRequest + config.windowMs - Date.now());
  }, [config.windowMs]);

  return {
    checkRateLimit,
    getRemainingRequests,
    getResetTime
  };
}

/**
 * API rate limiter with exponential backoff
 */
export function useAPIRateLimiter() {
  const backoffRef = useRef<number>(1000);
  const lastErrorRef = useRef<number>(0);

  const executeWithBackoff = useCallback(async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        // Reset backoff on success
        backoffRef.current = 1000;
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Check for rate limit response
        if (error?.status === 429 || error?.message?.includes('rate limit')) {
          const waitTime = backoffRef.current * Math.pow(2, attempt);
          backoffRef.current = Math.min(waitTime, 30000); // Max 30s
          lastErrorRef.current = Date.now();
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        } else {
          throw error;
        }
      }
    }
    
    throw lastError;
  }, []);

  const getBackoffTime = useCallback((): number => {
    const timeSinceError = Date.now() - lastErrorRef.current;
    if (timeSinceError > 60000) {
      backoffRef.current = 1000; // Reset after 1 minute
    }
    return backoffRef.current;
  }, []);

  return {
    executeWithBackoff,
    getBackoffTime
  };
}
