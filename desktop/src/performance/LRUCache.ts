/**
 * LRU 缓存
 * 文件：src/performance/LRUCache.ts
 * 文档 17 §4.1
 */

export interface LRUCacheOptions<K = string, V = any> {
  maxSize: number;
  defaultTTL?: number;
  onEvict?: (key: K, value: V) => void;
}

export class LRUCache<K = string, V = any> {
  private cache: Map<K, { value: V; expiresAt: number; size: number }> = new Map();
  private maxSize: number;
  private defaultTTL: number;
  private onEvict?: (key: K, value: V) => void;
  private currentSize: number = 0;

  constructor(options: LRUCacheOptions<K, V>) {
    this.maxSize = options.maxSize;
    this.defaultTTL = options.defaultTTL || 3600000;
    this.onEvict = options.onEvict;
  }

  /**
   * 获取值
   */
  get(key: K): V | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      return null;
    }

    // 移动到末尾（最近使用）
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 设置值
   */
  set(key: K, value: V, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    const size = this.estimateSize(value);

    // 如果已存在，先删除
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }

    // 添加新值
    this.cache.set(key, { value, expiresAt, size });
    this.currentSize += size;

    // 检查大小限制
    while (this.currentSize > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }
  }

  /**
   * 删除值
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.currentSize -= entry.size;

    if (this.onEvict) {
      this.onEvict(key, entry.value);
    }

    return true;
  }

  /**
   * 检查是否存在
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      return false;
    }

    return true;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache.entries()) {
        this.onEvict(key, entry.value);
      }
    }

    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.currentSize;
  }

  /**
   * 获取条目数
   */
  count(): number {
    return this.cache.size;
  }

  /**
   * 驱逐最旧的条目
   */
  private evictOldest(): void {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey == null) return;

    const entry = this.cache.get(oldestKey);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(oldestKey);

      if (this.onEvict) {
        this.onEvict(oldestKey, entry.value);
      }
    }
  }

  /**
   * 估算对象大小
   */
  private estimateSize(value: V): number {
    if (typeof value === 'string') {
      return value.length;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return 8;
    }

    if (value === null || value === void 0) {
      return 0;
    }

    try {
      return JSON.stringify(value).length;
    } catch {
      return 1024; // 默认 1KB
    }
  }
} 
