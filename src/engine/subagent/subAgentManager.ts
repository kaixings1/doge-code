import { predefinedAgents, type SubAgentConfig } from "./config.ts";
import { createAgentWorktree, removeAgentWorktree } from "../../utils/worktree.js";
import { getCwd } from "../../utils/cwd.js";

/**
 * SubAgent 事件类型，对齐 OpenCode AgentEvent。
 */
export type SubAgentEvent =
  | { type: 'start'; agentName: string; instanceId: string }
  | { type: 'iteration'; agentName: string; instanceId: string; iteration: number }
  | { type: 'tool_call'; agentName: string; instanceId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; agentName: string; instanceId: string; toolName: string; isError: boolean }
  | { type: 'complete'; agentName: string; instanceId: string; output: string; duration: number }
  | { type: 'fail'; agentName: string; instanceId: string; error: string; duration: number }
  | { type: 'abort'; agentName: string; instanceId: string }

export interface SubAgentManagerDeps {
  onEvent?: (event: SubAgentEvent) => void;
}

export interface SubAgentInstance {
  id: string;
  agentName: string;
  engine: { query: (input: string) => Promise<{ messages: { content?: string }[]; tokenUsage: unknown }>; abort: () => Promise<void> };
  startTime: Date;
  status: "running" | "completed" | "failed" | "terminated";
  /** OpenCode: Agent 级 git worktree 隔离路径 */
  worktreePath?: string;
  worktreeBranch?: string;
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
  private deps: SubAgentManagerDeps = {};

  constructor(deps?: SubAgentManagerDeps) {
    this.deps = deps ?? {};
    for (const [name, cfg] of Object.entries(predefinedAgents)) this.registry.set(name, cfg);
  }

  setDeps(deps: SubAgentManagerDeps): void {
    this.deps = deps;
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
    this.deps.onEvent?.({ type: 'start', agentName: params.agentName, instanceId: params.id });

    // OpenCode: 为 build 模式 Agent 创建隔离 worktree
    let worktreePath: string | undefined;
    let worktreeBranch: string | undefined;
    if (config.mode === 'build' || config.accessParentContext === false) {
      try {
        const wt = await createAgentWorktree('agent-' + params.agentName + '-' + params.id.slice(0, 8));
        worktreePath = wt.worktreePath;
        worktreeBranch = wt.worktreeBranch;
        instance.worktreePath = worktreePath;
        instance.worktreeBranch = worktreeBranch;
      } catch (_err) {
        // worktree 创建失败回退到共享文件系统
      }
    }

    try {
      const result = await instance.engine.query(params.input);
      instance.status = "completed";
      const duration = Date.now() - startTime.getTime();
      this.deps.onEvent?.({
        type: 'complete',
        agentName: params.agentName,
        instanceId: params.id,
        output: result.messages[result.messages.length - 1]?.content ?? "",
        duration,
      });
      return {
        success: true,
        output: result.messages[result.messages.length - 1]?.content ?? "",
        tokenUsage: result.tokenUsage,
        duration,
      };
    } catch (e) {
      instance.status = "failed";
      const duration = Date.now() - startTime.getTime();
      this.deps.onEvent?.({
        type: 'fail',
        agentName: params.agentName,
        instanceId: params.id,
        error: e instanceof Error ? e.message : String(e),
        duration,
      });
      return { success: false, error: e instanceof Error ? e.message : String(e), duration };
    } finally {
      // OpenCode: build 模式 Agent 完成后自动清理 worktree
      if (worktreePath && config.mode === 'build') {
        try { await removeAgentWorktree(worktreePath); } catch { /* noop */ }
      }
      this.instances.delete(params.id);
      this.activeAgents--;
    }
  }

  private createQueryEngine(config: SubAgentConfig, params: ExecuteSubAgentParams): SubAgentInstance["engine"] {
    const maxTokens = params.maxTokens ?? config.maxTokens ?? 4000;
    // 隔离的消息历史（含系统提示），保证子代理上下文不泄漏到父会话
    const messages: Array<{ role: string; content: string }> = [];
    let aborted = false;

    if (config.systemPrompt) {
      messages.push({ role: "system", content: config.systemPrompt });
    }

    return {
      async query(input: string) {
        if (aborted) {
          return { messages: [{ content: "[子代理已中止]" }], tokenUsage: { maxTokens } };
        }
        // 记录用户输入，维护隔离上下文
        messages.push({ role: "user", content: input });
        // 隔离引擎响应：标注代理身份与输入摘要。
        // 真实推理由外部引擎（见 §2 MessageLoop）注入，此处保证接口完整。
        const responseContent =
          `[${config.name}] 已收到输入（${input.length} 字符）。` +
          `当前为隔离引擎实现，真实推理由外部引擎注入。`;
        messages.push({ role: "assistant", content: responseContent });
        return { messages: [{ content: responseContent }], tokenUsage: { maxTokens } };
      },
      async abort() {
        aborted = true;
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
      this.deps.onEvent?.({ type: 'abort', agentName: instance.agentName, instanceId });
      await instance.engine.abort();
      this.instances.delete(instanceId);
      this.activeAgents--;
    }
  }
}
