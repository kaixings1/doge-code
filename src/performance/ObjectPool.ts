/**
 * 对象池
 * 文件：src/performance/ObjectPool.ts
 * 文档 17 §3.2
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;
  private created: number = 0;
  private reused: number = 0;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    maxSize: number = 100
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  /**
   * 获取对象
   */
  acquire(): T {
    if (this.pool.length > 0) {
      this.reused++;
      return this.pool.pop()!;
    }

    this.created++;
    return this.factory();
  }

  /**
   * 释放对象
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  /**
   * 预填充对象池
   */
  prefill(count: number): void {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * 清空对象池
   */
  clear(): void {
    this.pool = [];
  }

  /**
   * 获取统计
   */
  getStats(): {
    poolSize: number;
    created: number;
    reused: number;
    reuseRate: number;
  } {
    const total = this.created + this.reused;
    return {
      poolSize: this.pool.length,
      created: this.created,
      reused: this.reused,
      reuseRate: total > 0 ? this.reused / total : 0,
    };
  }
} 
