/**
 * 请求队列
 * 文件：src/performance/RequestQueue.ts
 * 文档 17 §6.1
 */

export interface QueuedRequest {
  id: string;
  priority: number;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private activeRequests: number = 0;
  private maxConcurrent: number;
  private processing: boolean = false;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 添加请求
   */
  async add<T>(
    request: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: `req-${Date.now()}-${Math.random()}`,
        priority,
        execute: request,
        resolve: resolve as (value: any) => void,
        reject,
      };

      this.queue.push(queuedRequest);
      this.queue.sort((a, b) => b.priority - a.priority);

      this.process();
    });
  }

  /**
   * 处理队列
   */
  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const request = this.queue.shift();
      if (!request) break;

      this.activeRequests++;

      request
        .execute()
        .then(request.resolve)
        .catch(request.reject)
        .finally(() => {
          this.activeRequests--;
          this.process();
        });
    }

    this.processing = false;
  }

  /**
   * 获取队列状态
   */
  getStatus(): {
    queueLength: number;
    activeRequests: number;
    maxConcurrent: number;
  } {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * 清空队列
   */
  clear(): void {
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }
} 
