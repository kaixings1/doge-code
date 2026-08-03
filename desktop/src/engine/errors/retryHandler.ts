/**
 * engine/errors/retryHandler.ts — 重试处理器（文档 02 §9.3）
 *
 * 指数退避 + 抖动，依据错误类型决定是否可重试。
 */
import { ErrorClassifier } from "./classifier.ts";
import { ErrorType } from "./index.ts";

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

const DEFAULT: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  exponentialBase: 2,
  jitter: true,
};

export class RetryHandler {
  private config: RetryConfig;
  private retryCount = 0;
  private lastError: Error | null = null;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT, ...config };
  }

  private retryableTypes: ErrorType[] = [
    ErrorType.RATE_LIMIT,
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT,
    ErrorType.SERVER_ERROR,
    ErrorType.API_ERROR,
  ];

  canRetry(error: unknown): boolean {
    if (this.retryCount >= this.config.maxRetries) return false;
    return this.retryableTypes.includes(ErrorClassifier.classify(error));
  }

  async retryWithBackoff<T>(fn: () => Promise<T>, error?: Error, maxRetries?: number): Promise<T> {
    const retries = maxRetries ?? this.config.maxRetries;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        this.retryCount = attempt;
        const result = await fn();
        this.retryCount = 0;
        return result;
      } catch (err) {
        this.lastError = err as Error;
        if (!this.canRetry(err)) throw err;
        if (attempt < retries - 1) {
          const delay = this.calculateDelay(attempt);
          console.warn(`Retry ${attempt + 1}/${retries} after ${delay}ms`, err);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }
    throw this.lastError ?? new Error("Retry failed");
  }

  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelay * Math.pow(this.config.exponentialBase, attempt);
    if (this.config.jitter) delay = delay * (0.5 + Math.random());
    return Math.min(delay, this.config.maxDelay);
  }

  getRetryCount(): number {
    return this.retryCount;
  }
  getLastError(): Error | null {
    return this.lastError;
  }
}