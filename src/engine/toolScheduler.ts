/**
 * engine/toolScheduler.ts — 工具调度器（文档 02 §6.1）
 *
 * 权限检查 → 分组（并行/串行）→ 执行 → 合并结果（保持顺序）。
 */
import type { ToolCall } from "./responseHandler.ts";

// [LOCAL] 本地定义工具类型，适配 D:\doge-code\src\ 架构
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  timeout?: number;
  canRunInParallel?: boolean;
  validate(params: unknown): { valid: boolean; errors?: string[] };
  execute(params: unknown, context?: { timeout?: number; onProgress?: (p: unknown) => void }): Promise<{ content: unknown }>;
}

export interface ToolResult {
  toolUseId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PermissionManager {
  check(tool: Tool, input: Record<string, unknown>): Promise<boolean>;
  requestAuthorization(tool: Tool, input: Record<string, unknown>): Promise<boolean>;
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
        out.push({ ...call });
        continue;
      }
      const has = await this.permissionManager.check(tool, call.input);
      if (has || (await this.permissionManager.requestAuthorization(tool, call.input))) {
        out.push(call);
      }
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
    if (!tool) return { success: false, error: `Tool not found: ${call.name}`, toolUseId: call.id };
    const validation = tool.validate(call.input);
    if (!validation.valid) {
      return { success: false, error: `Invalid: ${validation.errors.join(", ")}`, toolUseId: call.id };
    }
    try {
      const output = await this.executor.execute(tool, call.input, {
        timeout: (tool as { timeout?: number }).timeout ?? 600000,
      });
      return { success: true, output, toolUseId: call.id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e), toolUseId: call.id };
    }
  }

  private merge(original: ToolCall[], results: ToolResult[]): ToolResult[] {
    const map = new Map(results.map((r) => [r.toolUseId, r]));
    return original.map((c) => map.get(c.id) ?? { success: false, error: "未找到结果", toolUseId: c.id });
  }

  onProgress?: (toolUseId: string, progress: unknown) => void;
}
