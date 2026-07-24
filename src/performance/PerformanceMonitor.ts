/**
 * 性能监控器
 * 文件：src/performance/PerformanceMonitor.ts
 * 文档 17 §10.1
 */

import { MemoryMonitor } from './MemoryMonitor.js';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private memoryMonitor: MemoryMonitor;
  private timers: Map<string, number> = new Map();
  private counters: Map<string, number> = new Map();

  constructor() {
    this.memoryMonitor = new MemoryMonitor();
  }

  /**
   * 开始计时
   */
  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  /**
   * 结束计时
   */
  endTimer(name: string, tags?: Record<string, string>): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);

    this.recordMetric({
      name,
      value: duration,
      unit: 'ms',
      tags,
    });

    return duration;
  }

  /**
   * 增加计数器
   */
  incrementCounter(name: string, value: number = 1): void {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }

  /**
   * 获取计数器
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * 记录指标
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    this.metrics.push({
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      timestamp: Date.now(),
      tags: metric.tags,
    });

    // 保持指标历史
    if (this.metrics.length > 10000) {
      this.metrics.shift();
    }
  }

  /**
   * 获取指标
   */
  getMetrics(filter?: {
    name?: string;
    startTime?: number;
    endTime?: number;
  }): PerformanceMetric[] {
    let result = [...this.metrics];

    if (filter?.name) {
      result = result.filter((m) => m.name === filter.name);
    }

    if (filter?.startTime) {
      result = result.filter((m) => m.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      result = result.filter((m) => m.timestamp <= filter.endTime!);
    }

    return result;
  }

  /**
   * 获取性能报告
   */
  getReport(): {
    memory: ReturnType<MemoryMonitor['getReport']>;
    timers: Record<string, number>;
    counters: Record<string, number>;
    recentMetrics: PerformanceMetric[];
  } {
    return {
      memory: this.memoryMonitor.getReport(),
      timers: Object.fromEntries(this.timers),
      counters: Object.fromEntries(this.counters),
      recentMetrics: this.metrics.slice(-100),
    };
  }

  /**
   * 获取内存监控器
   */
  getMemoryMonitor(): MemoryMonitor {
    return this.memoryMonitor;
  }

  /**
   * 清空指标
   */
  clear(): void {
    this.metrics = [];
    this.counters.clear();
    this.timers.clear();
  }
} 
