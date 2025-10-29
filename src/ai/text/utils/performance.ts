/**
 * Performance optimization utilities for the web content analyzer
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Custom hook for debouncing values
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Custom hook for throttling function calls
 * @param callback - The function to throttle
 * @param delay - Delay in milliseconds
 * @returns The throttled function
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef(Date.now());

  return useCallback(
    ((...args) => {
      if (Date.now() - lastRun.current >= delay) {
        callback(...args);
        lastRun.current = Date.now();
      }
    }) as T,
    [callback, delay]
  );
}

/**
 * Custom hook for lazy loading with Intersection Observer
 * @param threshold - Intersection threshold (0-1)
 * @param rootMargin - Root margin for the observer
 * @returns [ref, isIntersecting] tuple
 */
export function useLazyLoading<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.1,
  rootMargin = '0px'
): [React.RefObject<T | null>, boolean] {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, isIntersecting];
}

/**
 * Custom hook for memoizing expensive calculations
 * @param factory - Function that returns the value to memoize
 * @param deps - Dependencies array
 * @returns The memoized value
 */
export function useMemoizedValue<T>(
  factory: () => T,
  deps: React.DependencyList
): T {
  const [value, setValue] = useState<T>(factory);
  const depsRef = useRef(deps);

  useEffect(() => {
    // Check if dependencies have changed
    const hasChanged = deps.some(
      (dep, index) => dep !== depsRef.current[index]
    );

    if (hasChanged) {
      setValue(factory());
      depsRef.current = deps;
    }
  }, deps);

  return value;
}

/**
 * Utility function to truncate text at word boundaries
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add when truncated
 * @returns Truncated text
 */
export function truncateAtWordBoundary(
  text: string,
  maxLength: number,
  suffix = '...'
): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.substring(0, maxLength - suffix.length);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

/**
 * Utility function to create a stable callback reference
 * @param callback - The callback function
 * @param deps - Dependencies array
 * @returns Stable callback reference
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, deps);

  return useCallback(((...args) => callbackRef.current(...args)) as T, []);
}

/**
 * Performance monitoring utility
 */
const timers = new Map<string, number>();

export const PerformanceMonitor = {
  start(label: string): void {
    timers.set(label, performance.now());
  },

  end(label: string): number {
    const startTime = timers.get(label);
    if (!startTime) {
      console.warn(`Performance timer '${label}' was not started`);
      return 0;
    }

    const duration = performance.now() - startTime;
    timers.delete(label);

    if (process.env.NODE_ENV === 'development') {
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  },

  measure<T>(label: string, fn: () => T): T {
    PerformanceMonitor.start(label);
    try {
      return fn();
    } finally {
      PerformanceMonitor.end(label);
    }
  },

  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    PerformanceMonitor.start(label);
    try {
      return await fn();
    } finally {
      PerformanceMonitor.end(label);
    }
  },
};

/**
 * Image optimization utilities
 */
export const ImageOptimization = {
  /**
   * Create optimized image loading attributes
   */
  getOptimizedImageProps: (src: string, alt: string, priority = false) => ({
    src,
    alt,
    loading: priority ? 'eager' : ('lazy' as const),
    decoding: 'async' as const,
    style: { contentVisibility: 'auto' } as React.CSSProperties,
  }),

  /**
   * Generate responsive image sizes
   */
  getResponsiveSizes: (breakpoints: Record<string, string>) => {
    return Object.entries(breakpoints)
      .map(([breakpoint, size]) => `(max-width: ${breakpoint}) ${size}`)
      .join(', ');
  },
};

/**
 * Content optimization utilities
 */
export const ContentOptimization = {
  /**
   * Optimize content for display by removing excessive whitespace
   */
  optimizeContent: (content: string): string => {
    return content
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n\n') // Normalize paragraph breaks
      .trim();
  },

  /**
   * Extract preview text from content
   */
  extractPreview: (content: string, maxLength = 150): string => {
    const cleaned = content.replace(/[#*_`]/g, '').trim();
    return truncateAtWordBoundary(cleaned, maxLength);
  },
};
