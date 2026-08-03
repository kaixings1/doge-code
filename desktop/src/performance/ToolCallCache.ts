/**
 * 工具调用缓存
 * 文件：src/performance/ToolCallCache.ts
 * 文档 17 §8.1
 */

import { LRUCache } from './LRUCache.js';

export class ToolCallCache {
  private cache: LRUCache<string, any>;
  private cachedTools: Set<string>;

  constructor(maxSize: number = 100 * 1024 * 1024) {
    this.cache = new LRUCache<string, any>({ maxSize, defaultTTL: 300000 });
    this.cachedTools = new Set([
      'Glob',
      'Grep',
      'Read',
      'WebFetch',
    ]);
  }

  /**
   * 检查工具是否支持缓存
   */
  isCacheable(toolName: string): boolean {
    return this.cachedTools.has(toolName);
  }

  /**
   * 生成缓存键
   */
  generateKey(toolName: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);

    return `${toolName}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * 获取缓存
   */
  get(toolName: string, params: Record<string, any>): any | null {
    if (!this.isCacheable(toolName)) {
      return null;
    }

    const key = this.generateKey(toolName, params);
    return this.cache.get(key);
  }

  /**
   * 设置缓存
   */
  set(toolName: string, params: Record<string, any>, result: any, ttl?: number): void {
    if (!this.isCacheable(toolName)) {
      return;
    }

    const key = this.generateKey(toolName, params);
    this.cache.set(key, result, ttl);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 添加可缓存工具
   */
  addCacheableTool(toolName: string): void {
    this.cachedTools.add(toolName);
  }

  /**
   * 移除可缓存工具
   */
  removeCacheableTool(toolName: string): void {
    this.cachedTools.delete(toolName);
  }
} 
