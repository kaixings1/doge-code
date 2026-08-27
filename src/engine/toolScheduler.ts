/**
 * engine/toolScheduler.ts — 工具调度器（文档 02 §6.1）
 *
 * 权限检查 → 分组（并行/串行）→ 执行 → 合并结果（保持顺序）。
 */
import type { ToolCall } from "./responseHandler.ts";
import type { CircuitBreaker } from "./errors/circuitBreaker.ts";

// [LOCAL] 本地定义工具类型，适配 D:\doge-code\src\ 架构
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  timeout?: number;
  canRunInParallel?: boolean;
  /** 工具标注（吸收自 n8n-mcp）：UI 展示用分类标签 */
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  /** 输出 schema（吸收自 n8n-mcp）：结构化响应描述 */
  outputSchema?: Record<string, unknown>;
  validate(params: unknown): { valid: boolean; errors?: string[] };
  execute(params: unknown, context?: { timeout?: number; onProgress?: (p: unknown) => void }): Promise<{ content: unknown }>;
}

/** 预处理工具参数：stringified JSON 解包 + null 值剥离（吸收自 n8n-mcp CallTool 管道） */
export function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  let raw = input as Record<string, unknown>;
  if (typeof raw.params === 'string') {
    try { raw = { ...raw, ...JSON.parse(raw.params) }; } catch { /* not json */ }
  }
  const str = JSON.stringify(raw);
  try { return JSON.parse(str); } catch { return raw; }
}

export interface ToolResult {
  toolUseId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  /** 错误分类（吸收自 deer-flow ToolErrorHandlingMiddleware）：下游可基于此决定重试策略 */
  errorType?: 'validation' | 'timeout' | 'network' | 'permission' | 'runtime' | 'unknown';
  /** 是否可由模型自行恢复（吸收自 deer-flow recoverable_by_model） */
  recoverableByModel?: boolean;
  /** 已重试次数（吸收自 deer-flow 重试策略） */
  retryCount?: number;
}

export interface PermissionManager {
  check(tool: Tool, input: Record<string, unknown>): Promise<boolean>;
  requestAuthorization(tool: Tool, input: Record<string, unknown>): Promise<boolean>;
  /**
   * 异步权限请求：通过事件通道等待 UI 层的 grant/deny 响应。
   * 对齐 OpenCode (Go) 的 PermissionService.Request() 模式。
   */
  requestPermission?(tool: Tool, input: Record<string, unknown>): Promise<boolean>;
  /**
   * 三选项权限请求：Allow once / Allow always / Reject（吸收自 Cline permissions.ts）。
   * 返回 { granted, remember }：remember=true 时持久化授权决策。
   */
  requestPermissionWithOptions?(tool: Tool, input: Record<string, unknown>): Promise<{ granted: boolean; remember: boolean }>;
}

export interface ToolExecutor {
  execute(
    tool: Tool,
    input: Record<string, unknown>,
    opts: { timeout: number; onProgress?: (p: unknown) => void },
  ): Promise<string>;
}

export class ToolScheduler {
  constructor(
    private registry: Map<string, Tool>,
    private permissionManager: PermissionManager,
    private executor: ToolExecutor,
    private errorRecovery?: { isCircuitOpen(key: string): boolean; recordToolSuccess(key: string): void; recordToolFailure(key: string): void },
  ) {}

  async execute(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const authorized = await this.checkPermissions(toolCalls);
    const { parallel, serial } = this.categorize(authorized);
    const parallelResults = await this.executeParallel(parallel);
    const serialResults = await this.executeSerial(serial);
    return this.merge(toolCalls, [...parallelResults, ...serialResults]);
  }

  private async checkPermissions(calls: ToolCall[]): Promise<ToolCall[]> {
    const out: ToolCall[] = [];
    for (const call of calls) {
      const tool = this.registry.get(call.name);
      if (!tool) {
        out.push(call);
        continue;
      }
      const has = await this.permissionManager.check(tool, call.input);
      if (has) {
        out.push(call);
        continue;
      }
      // 尝试自动授权（工具自身规则）
      const autoAuth = await this.permissionManager.requestAuthorization(tool, call.input);
      if (autoAuth) {
        out.push(call);
        continue;
      }
      // 异步权限请求：通过事件通道等待 UI 响应（对齐 OpenCode Request()）
      if (this.permissionManager.requestPermission) {
        const granted = await this.permissionManager.requestPermission(tool, call.input);
        if (granted) {
          out.push(call);
          continue;
        }
      }
      // 三选项权限请求：Allow once / Allow always / Reject（吸收自 Cline）
      if (this.permissionManager.requestPermissionWithOptions) {
        const { granted, remember } = await this.permissionManager.requestPermissionWithOptions(tool, call.input);
        if (granted && remember) {
          // remember=true: 持久化授权，下次 check() 应返回 true（由外部实现）
        }
        if (granted) {
          out.push(call);
          continue;
        }
      }
      // 拒绝：不加入 out，merge 会标记为失败
    }
    return out;
  }

  private categorize(calls: ToolCall[]): { parallel: ToolCall[]; serial: ToolCall[] } {
    const parallel: ToolCall[] = [];
    const serial: ToolCall[] = [];
    for (const call of calls) {
      const tool = this.registry.get(call.name);
      if (tool && (tool as { canRunInParallel?: boolean }).canRunInParallel) parallel.push(call);
      else serial.push(call);
    }
    return { parallel, serial };
  }

  private async executeParallel(calls: ToolCall[]): Promise<ToolResult[]> {
    if (calls.length === 0) return [];
    const results = await Promise.allSettled(calls.map((c) => this.executeSingle(c)));
    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { success: false, error: r.reason?.message ?? "Unknown error", toolUseId: calls[i].id } as ToolResult,
    );
  }

  private async executeSerial(calls: ToolCall[]): Promise<ToolResult[]> {
    const out: ToolResult[] = [];
    for (const call of calls) out.push(await this.executeSingle(call));
    return out;
  }

  private async executeSingle(call: ToolCall): Promise<ToolResult> {
    const tool = this.registry.get(call.name);
    if (!tool) {
      console.warn(`[TOOL] Tool not found: ${call.name}. Available tools: ${Array.from(this.registry.keys()).join(', ')}`);
      return { success: false, error: `工具未找到: ${call.name}`, toolUseId: call.id };
    }
    // 熔断器检查（吸收自 error-coordinator）：熔断器打开时跳过工具执行
    if (this.errorRecovery?.isCircuitOpen(call.name)) {
      return { success: false, error: `工具 ${call.name} 的熔断器已打开，跳过执行`, toolUseId: call.id };
    }
    // 参数预处理管道（吸收自 n8n-mcp CallTool）
    const normalizedInput = normalizeToolInput(call.input);
    const validation = tool.validate(normalizedInput);
    if (!validation.valid) {
      return { success: false, error: `无效的: ${validation.errors.join(", ")}`, toolUseId: call.id };
    }
    try {
      const output = await this.executor.execute(tool, normalizedInput, {
        timeout: (tool as { timeout?: number }).timeout ?? 600000,
      });
      // 记录成功到熔断器
      this.errorRecovery?.recordToolSuccess(call.name);
      return { success: true, output, toolUseId: call.id };
    } catch (e) {
      // 记录失败到熔断器
      this.errorRecovery?.recordToolFailure(call.name);
      return { success: false, error: e instanceof Error ? e.message : String(e), toolUseId: call.id };
    }
  }

  private merge(original: ToolCall[], results: ToolResult[]): ToolResult[] {
    const map = new Map(results.map((r) => [r.toolUseId, r]));
    return original.map((c) => map.get(c.id) ?? { success: false, error: "未找到结果", toolUseId: c.id });
  }

  onProgress?: (toolUseId: string, progress: unknown) => void;
}

/**
 * 异步两阶段工具结果（吸收自 agentscope 异步工具模式）。
 *
 * 长时间运行工具（如代码执行、数据处理）返回 operationId，
 * 调用方通过 pollOperation 轮询进度，最终通过 getResult 获取结果。
 */
export interface AsyncToolResult {
  toolUseId: string;
  operationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: unknown;
}

/** 异步工具接口：支持 create → poll → complete 两阶段执行（吸收自 agentscope） */
export interface AsyncTool extends Tool {
  /** 启动异步操作，返回 operationId */
  create?(params: unknown): Promise<{ operationId: string }>;
  /** 轮询操作进度 */
  poll?(operationId: string): Promise<{ status: string; progress?: unknown; output?: unknown }>;
  /** 获取最终结果 */
  getResult?(operationId: string): Promise<{ output: unknown }>;
}

/**
 * 异步工具执行器：处理 create → poll → complete 两阶段模式（吸收自 agentscope）。
 * 当工具实现 AsyncTool 接口时，使用异步流程；否则回退到同步执行。
 */
export class AsyncToolExecutor {
  private defaultPollInterval = 2000
  private defaultMaxPolls = 60

  async executeAsync(
    tool: Tool,
    input: Record<string, unknown>,
    opts: { timeout: number; onProgress?: (p: unknown) => void },
  ): Promise<{ content: unknown; metadata?: Record<string, unknown> }> {
    const asyncTool = tool as AsyncTool

    // Phase 1: 创建异步操作
    let operationId: string
    if (asyncTool.create) {
      const createResult = await asyncTool.create(input)
      operationId = createResult.operationId
    } else {
      // 不支持异步的工具回退到同步执行
      return { content: await this.executeSync(tool, input, opts) }
    }

    // Phase 2: 轮询直到完成
    const pollFn = asyncTool.poll ?? (async () => ({ status: 'completed' as const, output: '' }))
    const maxPolls = opts.timeout > 0 ? Math.min(this.defaultMaxPolls, Math.floor(opts.timeout / this.defaultPollInterval)) : this.defaultMaxPolls
    let polls = 0
    while (polls < maxPolls) {
      const result = await pollFn(operationId)
      if (result.status === 'completed' || result.status === 'failed') {
        const output = result.output ?? (result.status === 'failed' ? `操作失败: ${operationId}` : '')
        return {
          content: output,
          metadata: { operationId, status: result.status, polls },
        }
      }
      opts.onProgress?.((result as { progress?: unknown }).progress ?? { operationId, status: result.status })
      await new Promise(r => setTimeout(r, this.defaultPollInterval))
      polls++
    }

    // 超时
    return { content: `异步操作超时: ${operationId}`, metadata: { operationId, status: 'timeout' } }
  }

  private async executeSync(tool: Tool, input: Record<string, unknown>, opts: { timeout: number }): Promise<string> {
    const executor = (tool as { execute: (params: unknown, context?: { timeout?: number }) => Promise<{ content: unknown }> }).execute
    const result = await executor(input, { timeout: opts.timeout })
    if (typeof result.content === 'string') return result.content
    if (Array.isArray(result.content)) {
      return result.content
        .filter((p: { type: string; text?: string }) => p.type === 'text' && p.text)
        .map((p: { type: string; text?: string }) => p.text!)
        .join('\n') || ''
    }
    return String(result.content ?? '')
  }
}
