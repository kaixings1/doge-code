/**
 * Memoization
 * 文件：src/performance/Memoize.ts
 * 文档 17 §5.2
 */

export class Memoize {
  /**
   * 简单 memoize
   */
  static memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    const cache = new Map<string, ReturnType<T>>();

    return ((...args: Parameters<T>) => {
      const key = keyGenerator
        ? keyGenerator(...args)
        : JSON.stringify(args);

      if (cache.has(key)) {
        return cache.get(key);
      }

      const result = fn(...args);
      cache.set(key, result);
      return result;
    }) as T;
  }

  /**
   * 带 TTL 的 memoize
   */
  static memoizeWithTTL<T extends (...args: any[]) => any>(
    fn: T,
    ttl: number,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    const cache = new Map<string, { value: ReturnType<T>; expiresAt: number }>();

    return ((...args: Parameters<T>) => {
      const key = keyGenerator
        ? keyGenerator(...args)
        : JSON.stringify(args);

      const entry = cache.get(key);

      if (entry && Date.now() < entry.expiresAt) {
        return entry.value;
      }

      const result = fn(...args);
      cache.set(key, {
        value: result,
        expiresAt: Date.now() + ttl,
      });

      return result;
    }) as T;
  }

  /**
   * 异步 memoize
   */
  static memoizeAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    const cache = new Map<string, Promise<ReturnType<T>>>();

    return (async (...args: Parameters<T>) => {
      const key = keyGenerator
        ? keyGenerator(...args)
        : JSON.stringify(args);

      if (cache.has(key)) {
        return cache.get(key);
      }

      const promise = fn(...args);
      cache.set(key, promise);

      try {
        return await promise;
      } catch (error) {
        cache.delete(key);
        throw error;
      }
    }) as T;
  }
} 
