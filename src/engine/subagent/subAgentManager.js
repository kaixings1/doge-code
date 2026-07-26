/**
 * engine/subagent/subAgentManager.ts — 子代理管理器（文档 02 §10.2）
 *
 * 创建隔离的查询引擎实例、并发控制、聚合结果、终止代理。
 */
import { predefinedAgents } from "./config.ts";
export class SubAgentManager {
    registry = new Map();
    instances = new Map();
    maxConcurrentAgents = 5;
    activeAgents = 0;
    constructor() {
        for (const [name, cfg] of Object.entries(predefinedAgents))
            this.registry.set(name, cfg);
    }
    register(config) {
        this.registry.set(config.name, config);
    }
    async execute(params) {
        const config = this.registry.get(params.agentName);
        if (!config)
            return { success: false, error: `Sub-agent not found: ${params.agentName}`, duration: 0 };
        if (this.activeAgents >= this.maxConcurrentAgents) {
            return { success: false, error: "Maximum concurrent agents reached", duration: 0 };
        }
        this.activeAgents++;
        const startTime = new Date();
        const instance = {
            id: params.id,
            agentName: params.agentName,
            engine: this.createQueryEngine(config, params),
            startTime,
            status: "running",
        };
        this.instances.set(params.id, instance);
        try {
            const result = await instance.engine.query(params.input);
            instance.status = "completed";
            return {
                success: true,
                output: result.messages[result.messages.length - 1]?.content ?? "",
                tokenUsage: result.tokenUsage,
                duration: Date.now() - startTime.getTime(),
            };
        }
        catch (e) {
            instance.status = "failed";
            return { success: false, error: e instanceof Error ? e.message : String(e), duration: Date.now() - startTime.getTime() };
        }
        finally {
            this.activeAgents--;
            this.instances.delete(params.id);
        }
    }
    createQueryEngine(config, params) {
        const maxTokens = params.maxTokens ?? config.maxTokens ?? 4000;
        return {
            async query(input) {
                // 占位：隔离的子查询引擎执行（见 §2 MessageLoop）
                return { messages: [{ content: `[${config.name}] 骨架占位，待执行: ${input}` }], tokenUsage: { maxTokens } };
            },
            async abort() {
                // 占位：中止子代理
            },
        };
    }
    getActiveAgents() {
        return Array.from(this.instances.values()).filter((i) => i.status === "running");
    }
    async terminate(instanceId) {
        const instance = this.instances.get(instanceId);
        if (instance) {
            instance.status = "terminated";
            await instance.engine.abort();
            this.instances.delete(instanceId);
            this.activeAgents--;
        }
    }
}
