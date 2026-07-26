/**
 * engine/errors/retryHandler.ts — 重试处理器（文档 02 §9.3）
 *
 * 指数退避 + 抖动，依据错误类型决定是否可重试。
 */
import { ErrorClassifier } from "./classifier.ts";
import { ErrorType } from "./index.ts";
const DEFAULT = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    exponentialBase: 2,
    jitter: true,
};
export class RetryHandler {
    config;
    retryCount = 0;
    lastError = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT, ...config };
    }
    retryableTypes = [
        ErrorType.RATE_LIMIT,
        ErrorType.NETWORK_ERROR,
        ErrorType.TIMEOUT,
        ErrorType.SERVER_ERROR,
        ErrorType.API_ERROR,
    ];
    canRetry(error) {
        if (this.retryCount >= this.config.maxRetries)
            return false;
        return this.retryableTypes.includes(ErrorClassifier.classify(error));
    }
    async retryWithBackoff(fn, error, maxRetries) {
        const retries = maxRetries ?? this.config.maxRetries;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                this.retryCount = attempt;
                const result = await fn();
                this.retryCount = 0;
                return result;
            }
            catch (err) {
                this.lastError = err;
                if (!this.canRetry(err))
                    throw err;
                if (attempt < retries - 1) {
                    const delay = this.calculateDelay(attempt);
                    console.warn(`Retry ${attempt + 1}/${retries} after ${delay}ms`, err);
                    await new Promise((res) => setTimeout(res, delay));
                }
            }
        }
        throw this.lastError ?? new Error("Retry failed");
    }
    calculateDelay(attempt) {
        let delay = this.config.baseDelay * Math.pow(this.config.exponentialBase, attempt);
        if (this.config.jitter)
            delay = delay * (0.5 + Math.random());
        return Math.min(delay, this.config.maxDelay);
    }
    getRetryCount() {
        return this.retryCount;
    }
    getLastError() {
        return this.lastError;
    }
}
