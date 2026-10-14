import { promises as fs } from 'fs';
import path from 'path';

export interface Task {
  id: string;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  result?: any;
  error?: string;
}

export class TaskQueue {
  private queueDir: string;
  private processingDir: string;
  private completedDir: string;
  private failedDir: string;
  private active: boolean = false;

  constructor(baseDir: string) {
    this.queueDir = path.join(baseDir, 'queue');
    this.processingDir = path.join(baseDir, 'processing');
    this.completedDir = path.join(baseDir, 'completed');
    this.failedDir = path.join(baseDir, 'failed');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.queueDir, { recursive: true });
    await fs.mkdir(this.processingDir, { recursive: true });
    await fs.mkdir(this.completedDir, { recursive: true });
    await fs.mkdir(this.failedDir, { recursive: true });
    this.active = true;
  }

  async enqueue(task: Omit<Task, 'status' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const fullTask: Task = {
      ...task,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await fs.writeFile(
      path.join(this.queueDir, `${task.id}.json`),
      JSON.stringify(fullTask, null, 2)
    );
  }

  async dequeue(): Promise<Task | null> {
    const files = await fs.readdir(this.queueDir);
    if (files.length === 0) return null;

    // 竞态保护：多个 worker 并发 readdir 会拿到同一候选文件。
    // 用 link() 原子抢占——同文件系统上 link 对已存在目标返回 EEXIST，
    // 从而保证同一任务只有一个调用者拿到（rename 在 Windows 上不能
    // 提供该保证，实测并发下会产出重复任务）。
    for (const file of files) {
      const filePath = path.join(this.queueDir, file);
      const destPath = path.join(this.processingDir, file);

      try {
        await fs.link(filePath, destPath);
      } catch {
        // EEXIST：已被其他 worker 抢占；其他错误：跳过该候选
        continue;
      }

      // 已独占：删除队列中的原始链接
      await fs.unlink(filePath).catch(() => {});

      try {
        const content = await fs.readFile(destPath, 'utf-8');
        const task: Task = JSON.parse(content);
        task.status = 'processing';
        task.updatedAt = Date.now();
        await fs.writeFile(destPath, JSON.stringify(task, null, 2));
        return task;
      } catch {
        // 文件损坏：清理并继续
        await fs.unlink(destPath).catch(() => {});
        continue;
      }
    }

    return null;
  }

  /**
   * 把已取出（processing）的任务放回队列，供其他 worker 重新领取。
   *
   * 场景：主线程取到任务后无空闲 worker，不能丢任务。
   */
  async requeue(task: Task): Promise<void> {
    const file = `${task.id}.json`;
    const processingPath = path.join(this.processingDir, file);
    const queuePath = path.join(this.queueDir, file);

    task.status = 'pending';
    task.updatedAt = Date.now();
    await fs.writeFile(queuePath, JSON.stringify(task, null, 2));
    // 移除 processing 副本（可能已不在）
    await fs.unlink(processingPath).catch(() => {});
  }

  async complete(id: string, result: any): Promise<void> {
    const file = `${id}.json`;
    const srcPath = path.join(this.processingDir, file);
    try {
      const content = await fs.readFile(srcPath, 'utf-8');
      const task: Task = JSON.parse(content);
      task.status = 'completed';
      task.result = result;
      task.updatedAt = Date.now();
      await fs.writeFile(path.join(this.completedDir, file), JSON.stringify(task, null, 2));
      await fs.unlink(srcPath);
    } catch (e) {
      // File may have been moved or already completed
    }
  }

  async fail(id: string, error: string): Promise<void> {
    const file = `${id}.json`;
    const srcPath = path.join(this.processingDir, file);
    try {
      const content = await fs.readFile(srcPath, 'utf-8');
      const task: Task = JSON.parse(content);
      task.status = 'failed';
      task.error = error;
      task.updatedAt = Date.now();
      await fs.writeFile(path.join(this.failedDir, file), JSON.stringify(task, null, 2));
      await fs.unlink(srcPath);
    } catch (e) {
      // File may have been moved
    }
  }

  async getPendingCount(): Promise<number> {
    const files = await fs.readdir(this.queueDir);
    return files.length;
  }

  async getStats(): Promise<{ pending: number; completed: number; failed: number }> {
    const [pending, completed, failed] = await Promise.all([
      fs.readdir(this.queueDir).then(f => f.length).catch(() => 0),
      fs.readdir(this.completedDir).then(f => f.length).catch(() => 0),
      fs.readdir(this.failedDir).then(f => f.length).catch(() => 0),
    ]);
    return { pending, completed, failed };
  }

  async close(): Promise<void> {
    this.active = false;
  }
}
