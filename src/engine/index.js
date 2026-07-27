/**
 * engine/index.ts — 核心引擎装配入口
 *
 * 聚合：状态机 + 消息循环 + 消息规范化 + 请求构建 + 响应处理 +
 * 工具调度 + Token 预算 + 自动压缩 + 错误处理/恢复 + 流式 + 子代理。
 */
import { QueryStateMachine } from "./stateMachine.ts";
import { MessageLoop } from "./messageLoop.ts";
import { MessageNormalizer } from "./messageNormalizer.ts";
import { RequestBuilder } from "./requestBuilder.ts";
import { ResponseHandler } from "./responseHandler.ts";
import { ToolScheduler } from "./toolScheduler.ts";
import { TokenBudgetManager } from "./tokenBudgetManager.ts";
import { AutoCompactor } from "./autoCompactor.ts";
import { ErrorClassifier } from "./errors/classifier.ts";
import { RetryHandler } from "./errors/retryHandler.ts";
import { ErrorRecovery } from "./errors/recovery.ts";
import { SubAgentManager } from "./subagent/subAgentManager.ts";
export class QueryEngine {
    stateMachine = new QueryStateMachine();
    tokenBudget = new TokenBudgetManager();
    autoCompactor = new AutoCompactor();
    normalizer = new MessageNormalizer();
    requestBuilder = new RequestBuilder();
    responseHandler = new ResponseHandler();
    retryHandler = new RetryHandler();
    subAgentManager = new SubAgentManager();
    recovery;
    messageLoop;
    conversation = {
        messages: [],
        addToolResults: (results) => {
            for (const r of results) {
                this.conversation.messages.push({
                    role: "system",
                    content: typeof r === "string" ? r : JSON.stringify(r),
                });
            }
        },
    };
    constructor(opts) {
        const permissionManager = {
            async check() {
                return true;
            },
            async requestAuthorization() {
                return true;
            },
        };
        const executor = {
            async execute(tool, input, _o) {
                const r = await tool.execute(input);
                if (typeof r.content === "string")
                    return r.content;
                if (Array.isArray(r.content)) {
                    return r.content
                        .filter((p) => p.type === "text" && p.text)
                        .map((p) => p.text)
                        .join("\n") || "";
                }
                return String(r.content ?? "");
            },
        };
        const registry = opts.tools ?? this.buildRegistry();
        const toolScheduler = new ToolScheduler(registry, permissionManager, executor);
        this.recovery = new ErrorRecovery(this.stateMachine, this.retryHandler, this.autoCompactor);
        // 将内部工具注册表转换为请求构建器所需的 ToolDefinition 格式
        const toolDefinitions = Array.from(registry.values()).map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
        }));
        const deps = {
            stateMachine: this.stateMachine,
            tokenBudget: this.tokenBudget,
            requestBuilder: this.requestBuilder,
            responseHandler: this.responseHandler,
            toolScheduler,
            apiClient: {
                async sendMessage() {
                    return [Promise.resolve({ type: "message_stop" })];
                },
            },
            conversation: this.conversation,
            systemPrompt: opts.systemPrompt ?? "You are Doge Code, a helpful AI programming assistant.",
            model: opts.model,
            maxOutputTokens: opts.maxOutputTokens ?? 40000,
            toolDefinitions,
        };
        this.messageLoop = new MessageLoop(deps);
    }
    buildRegistry() {
        const map = new Map();
        for (const name of [
            "BashTool",
            "FileReadTool",
            "FileWriteTool",
            "GrepTool",
            "GlobTool",
        ]) {
            map.set(name, {
                name,
                description: `${name} — 骨架占位，待接入真实工具`,
                parameters: { type: "object", properties: {} },
                validate(_params) { return { valid: true }; },
                async execute(_params) {
                    return { content: `[${name}] 骨架占位，待接入真实工具` };
                },
            });
        }
        return map;
    }
    async query(userMessage) {
        return this.messageLoop.run(userMessage);
    }
    async abort() {
        await this.stateMachine.transition("aborted_by_user");
    }
    getState() {
        return this.stateMachine.state;
    }
    getTools() {
        const loop = this.messageLoop;
        return loop?.deps?.toolDefinitions ?? [];
    }
}
export { ErrorClassifier };
export * from "./stateMachine.ts";
export * from "./messageNormalizer.ts";
export * from "./requestBuilder.ts";
export * from "./responseHandler.ts";
export * from "./toolScheduler.ts";
export * from "./tokenBudgetManager.ts";
export * from "./autoCompactor.ts";
export * from "./errors/index.ts";
export * from "./errors/classifier.ts";
export * from "./errors/retryHandler.ts";
export * from "./errors/recovery.ts";
//# sourceMappingURL=index.js.map