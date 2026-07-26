/**
 * engine/errors/recovery.ts — 错误恢复器（文档 02 §9.4）
 *
 * 依据错误类型尝试恢复引擎状态：重试/压缩/回滚/需要用户干预/崩溃。
 */
import { ErrorClassifier } from "./classifier.ts";
import { ErrorType } from "./index.ts";
export class ErrorRecovery {
    stateMachine;
    retryHandler;
    autoCompactor;
    constructor(stateMachine, retryHandler, autoCompactor) {
        this.stateMachine = stateMachine;
        this.retryHandler = retryHandler;
        this.autoCompactor = autoCompactor;
    }
    async recover(error) {
        const type = ErrorClassifier.classify(error);
        switch (type) {
            case ErrorType.RATE_LIMIT:
                return this.fromRateLimit(error);
            case ErrorType.NETWORK_ERROR:
            case ErrorType.TIMEOUT:
                return this.fromNetwork(error);
            case ErrorType.PROMPT_TOO_LONG:
                await this.autoCompactor.compactPlaceholder();
                return { success: true, action: "retry", message: "Compacted, retrying" };
            case ErrorType.AUTH_ERROR:
                return {
                    success: false,
                    action: "needs_user",
                    message: "Authentication failed. Please run /login.",
                    requiresUserAction: {
                        type: "auth",
                        prompt: "Your API key is invalid. Please run `/login` to authenticate.",
                    },
                };
            case ErrorType.TOKEN_LIMIT_EXCEEDED:
                await this.autoCompactor.compactPlaceholder();
                return { success: true, action: "retry", message: "Compacted tokens, retrying" };
            case ErrorType.TOOL_EXECUTION_ERROR:
                return { success: true, action: "continue", message: "Tool failed, continuing" };
            case ErrorType.STATE_ERROR:
                this.stateMachine.reset();
                return { success: true, action: "restart", message: "状态机已重置" };
            default:
                return { success: false, action: "crash", message: `不可恢复的错误：${type}` };
        }
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
