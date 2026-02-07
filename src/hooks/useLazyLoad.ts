import { useState, useEffect, useRef, useCallback } from 'react';

interface LazyLoadOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook for lazy loading elements when they enter viewport
 * Great for video thumbnails, course cards, etc.
 */
export function useLazyLoad<T extends HTMLElement = HTMLDivElement>(
  options: LazyLoadOptions = {}
) {
  const { threshold = 0.1, rootMargin = '100px', triggerOnce = true } = options;
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const elementRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (triggerOnce && observerRef.current) {
              observerRef.current.unobserve(element);
            }
          } else if (!triggerOnce) {
            setIsVisible(false);
          }
        });
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [threshold, rootMargin, triggerOnce]);

  const onLoad = useCallback(() => {
    setHasLoaded(true);
  }, []);

  return {
    ref: elementRef,
    isVisible,
    hasLoaded,
    onLoad,
    shouldLoad: isVisible || hasLoaded
  };
}

/**
 * Hook for paginated/infinite loading of items
 * Useful for course lists, video grids
 */
export function useInfiniteScroll<T>(
  fetchFn: (page: number) => Promise<{ items: T[]; hasMore: boolean }>,
  options: { pageSize?: number } = {}
) {
  const { pageSize = 20 } = options;
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchFn(page);
      setItems(prev => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setPage(prev => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load items'));
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [fetchFn, page, hasMore]);

  const reset = useCallback(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    setError(null);
    loadingRef.current = false;
  }, []);

  // Intersection observer for auto-loading
  const { ref: loadTriggerRef, isVisible: shouldLoadMore } = useLazyLoad<HTMLDivElement>({
    threshold: 0,
    rootMargin: '200px'
  });

  useEffect(() => {
    if (shouldLoadMore && hasMore && !isLoading) {
      loadMore();
    }
  }, [shouldLoadMore, hasMore, isLoading, loadMore]);

  return {
    items,
    isLoading,
    hasMore,
    error,
    loadMore,
    reset,
    loadTriggerRef,
    totalLoaded: items.length
  };
}

/**
 * Preload images before displaying
 */
export function useImagePreloader() {
  const preloadedRef = useRef<Set<string>>(new Set());
  const preloadingRef = useRef<Map<string, Promise<void>>>(new Map());

  const preload = useCallback((url: string): Promise<void> => {
    if (preloadedRef.current.has(url)) {
      return Promise.resolve();
    }

    if (preloadingRef.current.has(url)) {
      return preloadingRef.current.get(url)!;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        preloadedRef.current.add(url);
        preloadingRef.current.delete(url);
        resolve();
      };
      img.onerror = () => {
        preloadingRef.current.delete(url);
        reject(new Error(`Failed to preload: ${url}`));
      };
      img.src = url;
    });

    preloadingRef.current.set(url, promise);
    return promise;
  }, []);

  const preloadBatch = useCallback(async (urls: string[], concurrency: number = 3) => {
    const results: boolean[] = [];
    
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch.map(preload));
      results.push(...batchResults.map(r => r.status === 'fulfilled'));
    }
    
    return results;
  }, [preload]);

  const isPreloaded = useCallback((url: string): boolean => {
    return preloadedRef.current.has(url);
  }, []);

  return {
    preload,
    preloadBatch,
    isPreloaded
  };
}
