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

    const file = files[0];
    const filePath = path.join(this.queueDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const task: Task = JSON.parse(content);

    task.status = 'processing';
    task.updatedAt = Date.now();
    await fs.writeFile(path.join(this.processingDir, file), JSON.stringify(task, null, 2));
    await fs.unlink(filePath);

    return task;
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
