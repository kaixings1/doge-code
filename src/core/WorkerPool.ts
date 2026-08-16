import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import path from 'path';
import os from 'os';
import { TaskQueue } from './TaskQueue';
import { MemoryManager } from './MemoryManager';

export interface PoolConfig {
  concurrency: number;
  taskDir: string;
  memoryThresholdMB?: number;
}

export class WorkerPool {
  private queue: TaskQueue;
  private memory: MemoryManager;
  private config: Required<PoolConfig>;
  private workers: Worker[] = [];
  private activeWorkers: number = 0;

  constructor(config: PoolConfig) {
    this.config = {
      concurrency: config.concurrency || Math.max(1, os.cpus().length - 1),
      taskDir: config.taskDir,
      memoryThresholdMB: config.memoryThresholdMB || 1024,
    };
    this.queue = new TaskQueue(config.taskDir);
    this.memory = new MemoryManager({
      highWaterMark: this.config.memoryThresholdMB,
      criticalWaterMark: this.config.memoryThresholdMB * 1.5,
    });
  }

  async init(): Promise<void> {
    await this.queue.init();
  }

  async run(processor: (task: any) => Promise<any>): Promise<void> {
    if (isMainThread) {
      this.spawnWorkers(processor);
      await this.monitor();
    } else {
      this.runWorker(processor);
    }
  }

  private spawnWorkers(processor: (task: any) => Promise<any>): void {
    const workerFile = path.join(__dirname, 'worker.js');

    for (let i = 0; i < this.config.concurrency; i++) {
      const worker = new Worker(workerFile, {
        execArgv: ['--max-old-space-size=4096'], // 4GB heap
      });
      
      worker.on('message', async (result) => {
        if (result.type === 'complete') {
          await this.queue.complete(result.taskId, result.data);
        } else if (result.type === 'error') {
          await this.queue.fail(result.taskId, result.error);
        }
        this.activeWorkers--;
        worker.terminate();
      });

      worker.on('error', async (err) => {
        console.error(`Worker ${i} error:`, err);
        this.activeWorkers--;
        worker.terminate();
      });

      this.workers.push(worker);
    }
  }

  private async monitor(): Promise<void> {
    const processNext = async () => {
      if (this.activeWorkers >= this.config.concurrency) {
        setTimeout(processNext, 100);
        return;
      }

      await this.memory.waitForMemory();
      const task = await this.queue.dequeue();
      
      if (!task) {
        // No more tasks, check if all workers done
        if (this.activeWorkers === 0) {
          return; // Done
        }
        setTimeout(processNext, 500);
        return;
      }

      this.activeWorkers++;
      const worker = this.workers.find(w => !w.isDead());
      if (worker) {
        worker.postMessage({ task });
      }
    };

    await processNext();
  }

  private async runWorker(processor: (task: any) => Promise<any>): Promise<void> {
    const mem = new MemoryManager();
    
    (async () => {
      while (true) {
        // @ts-ignore - workerData injected by main thread
        const task = await this.queue.dequeue();
        if (!task) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        try {
          // Periodic GC attempt
          mem.tryGC();
          
          const result = await processor(task);
          // @ts-ignore
          parentPort?.postMessage({ type: 'complete', taskId: task.id, data: result });
        } catch (error: any) {
          // @ts-ignore
          parentPort?.postMessage({ type: 'error', taskId: task.id, error: error.message });
        }
      }
    })();
  }

  async getStatus() {
    const stats = await this.queue.getStats();
    const mem = this.memory.getStatus();
    return { ...stats, memory: mem };
  }
}
