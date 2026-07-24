/**
 * engine/subagent/subAgentManager.ts — 子代理管理器（文档 02 §10.2）
 *
 * 创建隔离的查询引擎实例、并发控制、聚合结果、终止代理。
 */
import { predefinedAgents, type SubAgentConfig } from "./config.ts";

export interface SubAgentInstance {
  id: string;
  agentName: string;
  engine: { query: (input: string) => Promise<{ messages: { content?: string }[]; tokenUsage: unknown }>; abort: () => Promise<void> };
  startTime: Date;
  status: "running" | "completed" | "failed" | "terminated";
}

export interface ExecuteSubAgentParams {
  id: string;
  agentName: string;
  input: string;
  context?: string;
  maxTokens?: number;
  parentModel?: string;
}

export class SubAgentManager {
  private registry = new Map<string, SubAgentConfig>();
  private instances = new Map<string, SubAgentInstance>();
  private maxConcurrentAgents = 5;
  private activeAgents = 0;

  constructor() {
    for (const [name, cfg] of Object.entries(predefinedAgents)) this.registry.set(name, cfg);
  }

  register(config: SubAgentConfig): void {
    this.registry.set(config.name, config);
  }

  async execute(params: ExecuteSubAgentParams): Promise<{
    success: boolean;
    output?: string;
    tokenUsage?: unknown;
    duration: number;
    error?: string;
  }> {
    const config = this.registry.get(params.agentName);
    if (!config) return { success: false, error: `Sub-agent not found: ${params.agentName}`, duration: 0 };
    if (this.activeAgents >= this.maxConcurrentAgents) {
      return { success: false, error: "Maximum concurrent agents reached", duration: 0 };
    }
    this.activeAgents++;
    const startTime = new Date();
    const instance: SubAgentInstance = {
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
    } catch (e) {
      instance.status = "failed";
      return { success: false, error: e instanceof Error ? e.message : String(e), duration: Date.now() - startTime.getTime() };
    } finally {
      this.activeAgents--;
      this.instances.delete(params.id);
    }
  }

  private createQueryEngine(config: SubAgentConfig, params: ExecuteSubAgentParams): SubAgentInstance["engine"] {
    const maxTokens = params.maxTokens ?? config.maxTokens ?? 4000;
    return {
      async query(input: string) {
        // 占位：隔离的子查询引擎执行（见 §2 MessageLoop）
        return { messages: [{ content: `[${config.name}] 骨架占位，待执行: ${input}` }], tokenUsage: { maxTokens } };
      },
      async abort() {
        // 占位：中止子代理
      },
    };
  }

  getActiveAgents(): SubAgentInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.status === "running");
  }

  async terminate(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = "terminated";
      await instance.engine.abort();
      this.instances.delete(instanceId);
      this.activeAgents--;
    }
  }
}