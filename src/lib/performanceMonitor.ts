/**
 * Performance monitoring utilities for enterprise-ready scaling
 * Tracks Core Web Vitals, API latency, and user interactions
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface APICallMetric {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  timestamp: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private apiCalls: APICallMetric[] = [];
  private maxMetrics = 1000;
  private reportingEndpoint?: string;

  private constructor() {
    this.initWebVitals();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private initWebVitals() {
    // Track Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.recordMetric('LCP', lastEntry.startTime);
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

        // Track First Input Delay
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.recordMetric('FID', entry.processingStart - entry.startTime);
          });
        });
        fidObserver.observe({ type: 'first-input', buffered: true });

        // Track Cumulative Layout Shift
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as any[]) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          this.recordMetric('CLS', clsValue);
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {
        console.warn('Performance monitoring not fully supported:', e);
      }
    }
  }

  recordMetric(name: string, value: number, metadata?: Record<string, any>) {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      metadata
    };

    this.metrics.push(metric);
    
    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log significant issues
    if (name === 'LCP' && value > 2500) {
      console.warn(`[Perf] Slow LCP: ${value}ms`);
    }
    if (name === 'FID' && value > 100) {
      console.warn(`[Perf] High FID: ${value}ms`);
    }
    if (name === 'CLS' && value > 0.1) {
      console.warn(`[Perf] High CLS: ${value}`);
    }
  }

  trackAPICall(endpoint: string, method: string, duration: number, status: number) {
    const call: APICallMetric = {
      endpoint,
      method,
      duration,
      status,
      timestamp: Date.now()
    };

    this.apiCalls.push(call);
    
    // Trim old calls
    if (this.apiCalls.length > this.maxMetrics) {
      this.apiCalls = this.apiCalls.slice(-this.maxMetrics);
    }

    // Alert on slow APIs
    if (duration > 5000) {
      console.warn(`[API] Slow call: ${method} ${endpoint} took ${duration}ms`);
    }

    // Alert on errors
    if (status >= 500) {
      console.error(`[API] Server error: ${method} ${endpoint} returned ${status}`);
    }
  }

  getAverageAPILatency(endpointPattern?: string): number {
    const relevantCalls = endpointPattern 
      ? this.apiCalls.filter(c => c.endpoint.includes(endpointPattern))
      : this.apiCalls;
    
    if (relevantCalls.length === 0) return 0;
    
    const sum = relevantCalls.reduce((acc, call) => acc + call.duration, 0);
    return sum / relevantCalls.length;
  }

  getErrorRate(minutes: number = 5): number {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const recentCalls = this.apiCalls.filter(c => c.timestamp > cutoff);
    
    if (recentCalls.length === 0) return 0;
    
    const errors = recentCalls.filter(c => c.status >= 400).length;
    return errors / recentCalls.length;
  }

  getWebVitals(): Record<string, number | null> {
    const getLatest = (name: string) => {
      const relevant = this.metrics.filter(m => m.name === name);
      return relevant.length > 0 ? relevant[relevant.length - 1].value : null;
    };

    return {
      LCP: getLatest('LCP'),
      FID: getLatest('FID'),
      CLS: getLatest('CLS')
    };
  }

  getHealthSummary() {
    const vitals = this.getWebVitals();
    const avgLatency = this.getAverageAPILatency();
    const errorRate = this.getErrorRate();

    return {
      webVitals: vitals,
      apiMetrics: {
        averageLatency: Math.round(avgLatency),
        errorRate: Math.round(errorRate * 100),
        totalCalls: this.apiCalls.length
      },
      status: errorRate > 0.1 ? 'degraded' : avgLatency > 3000 ? 'slow' : 'healthy'
    };
  }

  // Create wrapped fetch for automatic tracking
  createTrackedFetch(): typeof fetch {
    const monitor = this;
    return async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const start = Date.now();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method || 'GET';

      try {
        const response = await fetch(input, init);
        monitor.trackAPICall(url, method, Date.now() - start, response.status);
        return response;
      } catch (error) {
        monitor.trackAPICall(url, method, Date.now() - start, 0);
        throw error;
      }
    };
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

// Utility to wrap Supabase calls with monitoring
export function withMonitoring<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: any[]) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      performanceMonitor.trackAPICall(operationName, 'SUPABASE', Date.now() - start, 200);
      return result;
    } catch (error: any) {
      performanceMonitor.trackAPICall(operationName, 'SUPABASE', Date.now() - start, error.code || 500);
      throw error;
    }
  }) as T;
}
