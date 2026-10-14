/**
 * 通用工作线程池。
 *
 * 设计：主线程负责「取任务 + 派发」，worker 线程只负责「执行 + 回传结果」。
 * 任务源为 TaskQueue（基于文件系统的原子队列），结果由主线程写回队列。
 *
 * 职责划分（关键，避免双份 dequeue 竞态）：
 *  - 主线程：monitor() 循环 dequeue → 选空闲 worker → postMessage
 *  - worker：on('message') 执行 processor → postMessage 回结果
 * worker 自身**不**再 dequeue；旧实现两边都在 dequeue，会互相抢任务。
 *
 * 资源回收：worker 连续空闲超过 idleTimeoutMs 会被 terminate，
 * 主线程按需补充，避免线程数长期悬空。
 */
import { Worker, isMainThread } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { TaskQueue } from './TaskQueue.js';
import { MemoryManager } from './MemoryManager.js';

export interface PoolConfig {
  concurrency: number;
  taskDir: string;
  memoryThresholdMB?: number;
  /** worker 空闲多久后回收（ms），默认 30s */
  idleTimeoutMs?: number;
  /** 主线程无任务时轮询间隔（ms），默认 500 */
  pollIntervalMs?: number;
  /** 测试注入点：worker 入口文件路径。默认同目录 worker.js（回退 worker.ts） */
  workerFile?: string;
  /** 传给 worker 的 execArgv，如 ['--max-old-space-size=4096']。默认不传 */
  execArgv?: string[];
}

/** worker 与主线程之间的消息协议。 */
type WorkerRequest = { type: 'run'; task: unknown };
type WorkerResponse =
  | { type: 'complete'; taskId: string; data: unknown }
  | { type: 'error'; taskId: string; error: string };

interface PoolWorker {
  worker: Worker
  active: boolean
  /** 空闲计时器句柄，派发任务时清除 */
  idleTimer: ReturnType<typeof setTimeout> | null
}

export class WorkerPool {
  private queue: TaskQueue;
  private memory: MemoryManager;
  private config: Required<Omit<PoolConfig, 'workerFile' | 'execArgv'>> & {
    workerFile: string
    execArgv?: string[]
  };
  private workers: PoolWorker[] = [];
  /** 主循环是否应继续运行 */
  private running = false;

  constructor(config: PoolConfig) {
    this.config = {
      concurrency: config.concurrency || Math.max(1, os.cpus().length - 1),
      taskDir: config.taskDir,
      memoryThresholdMB: config.memoryThresholdMB || 1024,
      idleTimeoutMs: config.idleTimeoutMs ?? 30_000,
      pollIntervalMs: config.pollIntervalMs ?? 500,
      workerFile: config.workerFile ?? defaultWorkerFile(),
      execArgv: config.execArgv,
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

  /**
   * 启动线程池。
   *
   * 主线程：按 concurrency 建 worker，循环取任务派发，直到队列空且无在执行任务。
   * worker 线程：是否走到这里取决于 worker 入口如何调用（见 worker.ts）——
   * 本方法在 worker 上下文中直接运行单任务消费循环。
   */
  async run(processor: (task: any) => Promise<any>): Promise<void> {
    if (isMainThread) {
      await this.runMain(processor);
    } else {
      this.runWorker(processor);
    }
  }

  /**
   * 常驻模式：持续运行直到显式 shutdown()。
   *
   * 与 run() 的区别——run() 在「队列空且无在执行任务」时收工返回；
   * runForever() 空转时仅等待，worker 按 idleTimeoutMs 自动回收、
   * 有新任务到来时按需补充，适合长期驻留的任务源（后台队列守护）。
   */
  async runForever(processor: (task: any) => Promise<any>): Promise<void> {
    if (!isMainThread) {
      this.runWorker(processor);
      return;
    }
    this.running = true;
    for (let i = 0; i < this.config.concurrency; i++) {
      this.spawnWorker();
    }
    while (this.running) {
      await this.memory.waitForMemory();
      // sleep/wait 期间可能被 shutdown，避免对已关闭队列继续取任务
      if (!this.running) {
        break;
      }
      const task = await this.queue.dequeue();
      if (!task) {
        // 空队列：不补充 worker（让空闲回收真正生效），仅等待
        await sleep(this.config.pollIntervalMs);
        continue;
      }
      let slot = this.pickIdleWorker();
      if (!slot) {
        // 有任务但无空闲 worker：按需补充后再派发
        this.spawnWorker();
        slot = this.pickIdleWorker();
      }
      if (!slot) {
        // 补充后仍无空闲（极端情况）：放回队列等待
        await this.queue.requeue(task);
        await sleep(this.config.pollIntervalMs);
        continue;
      }
      this.dispatch(slot, task);
    }
    this.shutdown();
  }

  /** 当前存活 worker 数（供测试与监控）。 */
  workerCount(): number {
    return this.workers.length;
  }

  // --------------------------------------------------------------------------
  // 主线程侧
  // --------------------------------------------------------------------------

  private async runMain(_processor: (task: any) => Promise<any>): Promise<void> {
    this.running = true;
    for (let i = 0; i < this.config.concurrency; i++) {
      this.spawnWorker();
    }

    // 派发循环：只要还有任务就继续。空队列且无在跑任务则收工。
    while (this.running) {
      await this.memory.waitForMemory();
      // sleep/wait 期间可能被 shutdown，避免对已关闭队列继续取任务
      if (!this.running) {
        break;
      }
      const task = await this.queue.dequeue();

      if (!task) {
        if (this.activeCount() === 0) {
          break; // 全部完成
        }
        await sleep(this.config.pollIntervalMs);
        continue;
      }

      const slot = this.pickIdleWorker();
      if (!slot) {
        // 无空闲 worker：把任务放回队列等待（避免丢任务）
        await this.queue.requeue(task);
        await sleep(this.config.pollIntervalMs);
        continue;
      }

      this.dispatch(slot, task);
    }

    // 收工：停掉所有 worker 与空闲计时器
    this.shutdown();
  }

  private spawnWorker(): void {
    // execArgv 可配置；默认不注入 heap 上限（调用方可能已带 execArgv，
    // 重复注入在部分运行器下会报 ERR_WORKER_INVALID_EXEC_ARGV）。
    const worker = new Worker(this.config.workerFile, {
      ...(this.config.execArgv ? { execArgv: this.config.execArgv } : {}),
    });

    const slot: PoolWorker = { worker, active: false, idleTimer: null };
    this.workers.push(slot);

    worker.on('message', (result: WorkerResponse) => {
      void this.handleResult(slot, result);
    });

    worker.on('error', (err: Error) => {
      console.error(`[WorkerPool] worker 错误: ${err.message}`);
      this.retireWorker(slot);
    });

    // worker 退出（异常或主动终止）时从存活列表移除
    worker.on('exit', () => {
      const idx = this.workers.indexOf(slot);
      if (idx >= 0) {
        this.workers.splice(idx, 1);
      }
      if (slot.idleTimer) {
        clearTimeout(slot.idleTimer);
        slot.idleTimer = null;
      }
    });

    // 新 worker 建立即开始空闲计时
    this.armIdleTimer(slot);
  }

  private async handleResult(
    slot: PoolWorker,
    result: WorkerResponse,
  ): Promise<void> {
    if (result.type === 'complete') {
      await this.queue.complete(result.taskId, result.data);
    } else {
      await this.queue.fail(result.taskId, result.error);
    }

    slot.active = false;
    // 主线程收工阶段无需再补计时器
    if (this.running) {
      this.armIdleTimer(slot);
    }
  }

  private dispatch(slot: PoolWorker, task: { id: string }): void {
    slot.active = true;
    if (slot.idleTimer) {
      clearTimeout(slot.idleTimer);
      slot.idleTimer = null;
    }
    const req: WorkerRequest = { type: 'run', task };
    slot.worker.postMessage(req);
  }

  /** 超时未接到任务的 worker 回收，防止线程长期悬空。 */
  private armIdleTimer(slot: PoolWorker): void {
    if (slot.idleTimer) {
      clearTimeout(slot.idleTimer);
    }
    slot.idleTimer = setTimeout(() => {
      if (!slot.active) {
        this.retireWorker(slot);
      }
    }, this.config.idleTimeoutMs);
    // 空闲计时器不应阻止进程退出
    slot.idleTimer.unref?.();
  }

  private retireWorker(slot: PoolWorker): void {
    if (slot.idleTimer) {
      clearTimeout(slot.idleTimer);
      slot.idleTimer = null;
    }
    void slot.worker.terminate();
    // exit 事件里会从 this.workers 移除
  }

  private pickIdleWorker(): PoolWorker | null {
    return this.workers.find(w => !w.active) ?? null;
  }

  private activeCount(): number {
    return this.workers.filter(w => w.active).length;
  }

  /** 停止主循环并回收全部 worker。 */
  shutdown(): void {
    this.running = false;
    for (const slot of [...this.workers]) {
      this.retireWorker(slot);
    }
  }

  // --------------------------------------------------------------------------
  // worker 线程侧
  // --------------------------------------------------------------------------

  /**
   * worker 侧消费循环：被动接收主线程派发的任务并执行。
   *
   * 不再自行 dequeue（旧实现与主线程双份拉取，会抢任务/重复处理）。
   */
  private runWorker(processor: (task: any) => Promise<any>): void {
    // 动态引入 parentPort，避免主线程加载时产生未使用告警
    const { parentPort } = require('worker_threads') as typeof import('worker_threads');
    if (!parentPort) {
      return;
    }

    parentPort.on('message', async (req: WorkerRequest) => {
      if (req?.type !== 'run') {
        return;
      }
      const task = req.task as { id: string };
      this.memory.tryGC();
      try {
        const data = await processor(task);
        parentPort.postMessage({
          type: 'complete',
          taskId: task.id,
          data,
        } satisfies WorkerResponse);
      } catch (error) {
        parentPort.postMessage({
          type: 'error',
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies WorkerResponse);
      }
    });
  }

  async getStatus() {
    const stats = await this.queue.getStats();
    const mem = this.memory.getStatus();
    return { ...stats, memory: mem, workers: this.workers.length };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 默认 worker 入口文件。
 *
 * 优先同目录的 worker.js（构建产物）；源码调试时回退到 worker.ts，
 * 由 tsx/ts-node 等加载器处理。
 */
function defaultWorkerFile(): string {
  // 优先使用本文件所在目录（ESM/CJS 均可通过 import.meta.url 求得）
  let here: string;
  try {
    here = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    here = __dirname;
  }
  const jsCandidate = path.join(here, 'worker.js');
  try {
    // 存在即用（构建后场景）
    if (require('fs').existsSync(jsCandidate)) {
      return jsCandidate;
    }
  } catch {
    /* ignore */
  }
  return path.join(here, 'worker.ts');
}
