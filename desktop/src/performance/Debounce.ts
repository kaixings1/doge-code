/**
 * 防抖与节流
 * 文件：src/performance/Debounce.ts
 * 文档 17 §5.1
 */

export class Debounce {
  /**
   * 防抖函数
   */
  static debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timer: Timer | null = null;

    return (...args: Parameters<T>) => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        fn(...args);
        timer = null;
      }, delay);
    };
  }

  /**
   * 节流函数
   */
  static throttle<T extends (...args: any[]) => any>(
    fn: T,
    interval: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timer: Timer | null = null;

    return (...args: Parameters<T>) => {
      const now = Date.now();
      const remaining = interval - (now - lastCall);

      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        lastCall = now;
        fn(...args);
      } else if (!timer) {
        timer = setTimeout(() => {
          lastCall = Date.now();
          timer = null;
          fn(...args);
        }, remaining);
      }
    };
  }

  /**
   * 立即执行防抖
   */
  static debounceImmediate<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timer: Timer | null = null;
    let called = false;

    return (...args: Parameters<T>) => {
      if (!called) {
        fn(...args);
        called = true;
      }

      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        called = false;
        timer = null;
      }, delay);
    };
  }
} 
