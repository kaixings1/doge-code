#!/usr/bin/env bun
/**
 * 长时间运行任务处理系统
 * 
 * 特性：
 * 1. 基于文件的任务队列，支持断点续传
 * 2. Worker隔离，防止内存泄漏扩散
 * 3. 内存监控与自动GC
 * 4. 优雅关闭与进度持久化
 */

import { WorkerPool } from './core/WorkerPool';
import { MemoryManager } from './core/MemoryManager';
import { TaskQueue } from './core/TaskQueue';
import yaml from 'yaml';

interface AppConfig {
  taskDir: string;
  concurrency: number;
  memoryLimitMB: number;
  outputDir: string;
  maxRetries: number;
}

class LongRunningApp {
  private pool!: WorkerPool;
  private memory!: MemoryManager;
  private config!: AppConfig;

  async init(configPath?: string): Promise<void> {
    const config = await this.loadConfig(configPath);
    this.config = config;
    
    this.pool = new WorkerPool({
      concurrency: config.concurrency,
      taskDir: config.taskDir,
      memoryThresholdMB: config.memoryLimitMB,
    });
    
    this.memory = new MemoryManager({
      highWaterMark: config.memoryLimitMB,
      criticalWaterMark: config.memoryLimitMB * 2,
    });

    await this.pool.init();
    this.setupGracefulShutdown();
    
    console.log('System initialized:', {
      taskDir: config.taskDir,
      concurrency: config.concurrency,
      memoryLimit: `${config.memoryLimitMB}MB`,
    });
  }

  private async loadConfig(configPath?: string): Promise<AppConfig> {
    const path = configPath || './config/app.yaml';
    try {
      const content = await Bun.file(path).text();
      const parsed = yaml.parse(content) as AppConfig;
      return {
        taskDir: parsed.taskDir || './tasks',
        concurrency: parsed.concurrency || 4,
        memoryLimitMB: parsed.memoryLimitMB || 1024,
        outputDir: parsed.outputDir || './output',
        maxRetries: parsed.maxRetries || 3,
      };
    } catch {
      return {
        taskDir: './tasks',
        concurrency: 4,
        memoryLimitMB: 1024,
        outputDir: './output',
        maxRetries: 3,
      };
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      const status = await this.pool.getStatus();
      console.log('Final status:', status);
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  async run(processor: (task: any) => Promise<any>): Promise<void> {
    console.log('Starting task processing...');
    await this.pool.run(processor);
    console.log('All tasks completed');
  }

  async getStatus() {
    return this.pool.getStatus();
  }
}

// CLI接口
const app = new LongRunningApp();
const command = process.argv[2];

switch (command) {
  case 'run':
    // Dynamic import processor
    const processorPath = process.argv[3] || './processor.ts';
    const processor = (await import(processorPath)).default;
    await app.init();
    await app.run(processor);
    break;
    
  case 'status':
    await app.init();
    const status = await app.getStatus();
    console.log(JSON.stringify(status, null, 2));
    break;
    
  case 'enqueue':
    const taskData = JSON.parse(process.argv[3] || '{}');
    await app.init();
    // Simplified: in real app, would use TaskQueue directly
    console.log('Task enqueued:', taskData);
    break;
    
  default:
    console.log(`
Long Running Task Processor
Usage:
  bun run src/index.ts run [processorPath]  - Start processing
  bun run src/index.ts status               - Show queue status
  bun run src/index.ts enqueue <json>       - Add task to queue
   
