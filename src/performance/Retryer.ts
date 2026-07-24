/**
 * 请求重试器
 * 文件：src/performance/Retryer.ts
 * 文档 17 §6.2
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

export class Retryer {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      ...config,
    };
  }

  /**
   * 执行带重试的请求
   */
  async execute<T>(request: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.config.maxAttempts) {
          break;
        }

        if (!this.isRetryable(lastError)) {
          break;
        }

        if (this.config.onRetry) {
          this.config.onRetry(attempt, lastError);
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * 检查错误是否可重试
   */
  private isRetryable(error: Error): boolean {
    if (!this.config.retryableErrors) {
      return true;
    }

    return this.config.retryableErrors.some(
      (pattern) =>
        error.message.toLowerCase().includes(pattern.toLowerCase()) ||
        error.name.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * 计算延迟
   */
  private calculateDelay(attempt: number): number {
    const delay =
      this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxDelay);
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
} 
