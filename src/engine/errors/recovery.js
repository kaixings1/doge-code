/**
 * engine/errors/recovery.ts — 错误恢复器（文档 02 §9.4）
 *
 * 依据错误类型尝试恢复引擎状态：重试/压缩/回滚/需要用户干预/崩溃。
 */
import { ErrorClassifier } from "./classifier.ts";
import { ErrorType } from "./index.ts";
import { CircuitBreaker } from "./circuitBreaker.ts";
export class ErrorRecovery {
    constructor(stateMachine, retryHandler, autoCompactor, circuitBreakerConfig) {
        this.stateMachine = stateMachine;
        this.retryHandler = retryHandler;
        this.autoCompactor = autoCompactor;
        this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    }
    /**
     * recover — 尝试恢复引擎状态（吸收自 error-coordinator 错误分类 + 熔断器）
     *
     * 恢复策略：
     * 1. 先检查熔断器：如果实体被熔断，直接返回降级结果
     * 2. 根据错误类型选择恢复策略
     * 3. 记录成功/失败到熔断器
     */
    async recover(error, entityKey) {
        // 熔断器检查（吸收自 error-coordinator 熔断器模式）
        if (entityKey) {
            const cbResult = this.circuitBreaker.check(entityKey);
            if (!cbResult.allowed) {
                return {
                    success: false,
                    action: "crash",
                    message: `熔断器拦截：${cbResult.reason}`,
                    circuitBreakerState: cbResult,
                };
            }
        }
        const type = ErrorClassifier.classify(error);
        let result;
        switch (type) {
            case ErrorType.RATE_LIMIT:
                result = await this.fromRateLimit(error);
                break;
            case ErrorType.NETWORK_ERROR:
            case ErrorType.TIMEOUT:
                result = await this.fromNetwork(error);
                break;
            case ErrorType.PROMPT_TOO_LONG:
                await this.autoCompactor.compactPlaceholder();
                result = { success: true, action: "retry", message: "Compacted, retrying" };
                break;
            case ErrorType.AUTH_ERROR:
                result = {
                    success: false,
                    action: "needs_user",
                    message: "Authentication failed. Please run /login.",
                    requiresUserAction: {
                        type: "auth",
                        prompt: "Your API key is invalid. Please run `/login` to authenticate.",
                    },
                };
                break;
            case ErrorType.TOKEN_LIMIT_EXCEEDED:
                await this.autoCompactor.compactPlaceholder();
                result = { success: true, action: "retry", message: "Compacted tokens, retrying" };
                break;
            case ErrorType.TOOL_EXECUTION_ERROR:
                result = { success: true, action: "continue", message: "Tool failed, continuing" };
                break;
            case ErrorType.STATE_ERROR:
                this.stateMachine.reset();
                result = { success: true, action: "restart", message: "状态机已重置" };
                break;
            default:
                result = { success: false, action: "crash", message: `不可恢复的错误：${type}` };
        }
        // 记录结果到熔断器（吸收自 error-coordinator 错误率跟踪）
        if (entityKey) {
            if (result.success) {
                this.circuitBreaker.recordSuccess(entityKey);
            }
            else {
                this.circuitBreaker.recordFailure(entityKey);
            }
        }
        return result;
    }
    /**
     * recordToolFailure — 工具执行失败后记录（吸收自 error-coordinator 部分结果组合）
     *
     * 当工具失败但不影响整体流程时调用，熔断器记录失败但不阻止继续。
     */
    recordToolFailure(toolName) {
        this.circuitBreaker.recordFailure(toolName);
    }
    /**
     * recordToolSuccess — 工具执行成功后记录
     */
    recordToolSuccess(toolName) {
        this.circuitBreaker.recordSuccess(toolName);
    }
    /**
     * isCircuitOpen — 检查指定工具的熔断器是否打开
     */
    isCircuitOpen(key) {
        const result = this.circuitBreaker.check(key);
        return !result.allowed;
    }
    /**
     * getCircuitState — 获取熔断器状态
     */
    getCircuitState(key) {
        return this.circuitBreaker.check(key);
    }
    /**
     * resetCircuit — 重置指定实体的熔断器
     */
    resetCircuit(key) {
        this.circuitBreaker.reset(key);
    }
    /**
     * resetAllCircuits — 重置所有熔断器
     */
    resetAllCircuits() {
        this.circuitBreaker.resetAll();
    }
    /**
     * getCircuitBreaker — 获取底层熔断器实例（供外部直接操作）
     */
    getCircuitBreaker() {
        return this.circuitBreaker;
    }
    async fromRateLimit(error) {
        const wait = error.retryAfter ?? 60;
        console.warn(`Rate limited. Waiting ${wait}s...`);
        await new Promise((res) => setTimeout(res, wait * 1000));
        return { success: true, action: "retry", message: `Retrying after ${wait}s` };
    }
    async fromNetwork(error) {
        try {
            await this.retryHandler.retryWithBackoff(async () => true, error, 3);
            return { success: true, action: "retry", message: "Network recovered" };
        }
        catch {
            return { success: false, action: "crash", message: "Network unrecoverable" };
        }
    }
}
