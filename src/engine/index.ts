/**
 * engine/index.ts — 核心引擎装配入口
 *
 * 聚合：状态机 + 消息循环 + 消息规范化 + 请求构建 + 响应处理 +
 * 工具调度 + Token 预算 + 自动压缩 + 错误处理/恢复 + 流式 + 子代理。
 */
import { QueryStateMachine } from "./stateMachine.ts";
import { MessageLoop, type MessageLoopDeps, type QueryResult } from "./messageLoop.ts";
import { MessageNormalizer, type InternalMessage } from "./messageNormalizer.ts";
import { RequestBuilder, type ToolDefinition } from "./requestBuilder.ts";
import { ResponseHandler } from "./responseHandler.ts";
import { ToolScheduler, type PermissionManager, type ToolExecutor, type Tool } from "./toolScheduler.ts";
import { TokenBudgetManager } from "./tokenBudgetManager.ts";
import { AutoCompactor } from "./autoCompactor.ts";
import { ErrorClassifier } from "./errors/classifier.ts";
import { RetryHandler } from "./errors/retryHandler.ts";
import { ErrorRecovery } from "./errors/recovery.ts";
import { SubAgentManager } from "./subagent/subAgentManager.ts";
// 导入真实工具
import { FileReadTool } from "../tools/FileReadTool/FileReadTool.js";
import { FileWriteTool } from "../tools/FileWriteTool/FileWriteTool.js";
import { FileEditTool } from "../tools/FileEditTool/FileEditTool.js";
import { BashTool } from "../tools/BashTool/BashTool.js";
import { GlobTool } from "../tools/GlobTool/GlobTool.js";
import { GrepTool } from "../tools/GrepTool/GrepTool.js";
import { WebFetchTool } from "../tools/WebFetchTool/WebFetchTool.js";
import { NotebookEditTool } from "../tools/NotebookEditTool/NotebookEditTool.js";

export interface Conversation {
  messages: InternalMessage[];
  addToolResults: (results: unknown[]) => void;
}

export interface EngineOptions {
  model: string;
  maxOutputTokens?: number;
  systemPrompt?: string;
  tools?: Map<string, Tool>;
  provider?: "anthropic" | "openai";
  /** Agent 事件回调，用于 UI 层订阅循环状态变化 */
  onEvent?: (event: import("./messageLoop.ts").AgentEvent) => void;
}

/**
 * 引擎级权限请求信息，对齐 OpenCode (Go) 的 PermissionRequest。
 * UI 层通过 grantPermission/denyPermission 响应。
 */
export interface AgentPermissionRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  description?: string;
}

export class QueryEngine {
  readonly stateMachine = new QueryStateMachine();
  readonly tokenBudget = new TokenBudgetManager();
  readonly autoCompactor = new AutoCompactor();
  readonly normalizer = new MessageNormalizer();
  readonly requestBuilder = new RequestBuilder();
  readonly responseHandler = new ResponseHandler();
  readonly retryHandler = new RetryHandler();
  readonly subAgentManager = new SubAgentManager();
  readonly recovery: ErrorRecovery;
  readonly conversation: Conversation;
  private abortController: AbortController = new AbortController();

  private messageLoop: MessageLoop;
  private _toolDefinitions: ToolDefinition[] = [];
  private pendingRequests = new Map<string, { resolve: (v: boolean) => void }>();
  private _conversation: Conversation = {
    messages: [],
    addToolResults: (results) => {
      for (const r of results) {
        const resultRecord = r as Record<string, unknown>
        const toolUseId = typeof resultRecord.toolUseId === 'string' ? resultRecord.toolUseId : null
        const contentVal = typeof resultRecord.output === 'string' ? resultRecord.output : JSON.stringify(resultRecord.output ?? resultRecord.error ?? '')
        this._conversation.messages.push({
          role: "tool" as const,
          ...(toolUseId ? { toolUseId } : {}),
          content: contentVal,
        });
      }
    },
  };

  constructor(opts: EngineOptions) {
    const permissionManager: PermissionManager = {
      async check() {
        return true;
      },
      async requestAuthorization() {
        return true;
      },
      async requestPermission(tool, input) {
        // 检查是否已有 auto-approve 规则
        if (opts.onEvent) {
          const requestId = `${tool.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const request: AgentPermissionRequest = {
            id: requestId,
            toolName: tool.name,
            input,
            description: tool.description,
          };
          // 发射权限请求事件，等待 UI 响应
          opts.onEvent({
            type: 'permission_request',
            id: requestId,
            toolName: tool.name,
            input,
            description: tool.description,
          });
          // 返回一个 pending promise，由 grantPermission/denyPermission 解析
          return new Promise<boolean>((resolve) => {
            this.pendingRequests.set(requestId, { resolve });
          });
        }
        // 无事件回调时默认拒绝
        return false;
      },
    };
    const executor: ToolExecutor = {
      async execute(tool, input, _o) {
        const r = await tool.execute(input);
        if (typeof r.content === "string") return r.content;
        if (Array.isArray(r.content)) {
          return r.content
            .filter((p: { type: string; text?: string }) => p.type === "text" && p.text)
            .map((p: { type: string; text?: string }) => p.text!)
            .join("\n") || "";
        }
        return String(r.content ?? "");
      },
    };
    const registry = opts.tools ?? this.buildRegistry();
    const toolScheduler = new ToolScheduler(registry, permissionManager, executor);

    this.recovery = new ErrorRecovery(this.stateMachine, this.retryHandler, this.autoCompactor);
    this.conversation = this._conversation;

    // 将内部工具注册表转换为请求构建器所需的 ToolDefinition 格式
    this._toolDefinitions = Array.from(registry.values()).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const deps: MessageLoopDeps = {
      stateMachine: this.stateMachine,
      tokenBudget: this.tokenBudget,
      requestBuilder: this.requestBuilder,
      responseHandler: this.responseHandler,
      toolScheduler,
      apiClient: {
        async sendMessage() {
          return [Promise.resolve({ type: "message_stop" })] as unknown as AsyncIterable<unknown>;
        },
      },
      conversation: this._conversation,
      systemPrompt: opts.systemPrompt ?? "You are Doge Code, a helpful AI programming assistant.",
      model: opts.model,
      maxOutputTokens: opts.maxOutputTokens ?? 40000,
      toolDefinitions: this._toolDefinitions,
      provider: opts.provider ?? "openai",
      onEvent: opts.onEvent,
      autoCompactor: this.autoCompactor,
    };
    this.messageLoop = new MessageLoop(deps);

    // 注入 API client 到 AutoCompactor，使 SummaryStrategy 能通过 LLM 生成真实摘要
    this.autoCompactor.setApiClient({
      sendMessage: deps.apiClient.sendMessage.bind(deps.apiClient),
    });
  }

  private buildRegistry(): Map<string, Tool> {
    const map = new Map<string, Tool>();
    const adapters: { name: string; instance: { call: (...args: unknown[]) => Promise<unknown> }; desc: string }[] = [
      { name: "BashTool", instance: BashTool, desc: "执行 shell 命令" },
      { name: "FileReadTool", instance: FileReadTool, desc: "读取文件内容" },
      { name: "FileWriteTool", instance: FileWriteTool, desc: "写入文件" },
      { name: "FileEditTool", instance: FileEditTool, desc: "编辑文件" },
      { name: "GrepTool", instance: GrepTool, desc: "搜索文件内容" },
      { name: "GlobTool", instance: GlobTool, desc: "查找文件" },
      { name: "WebFetchTool", instance: WebFetchTool, desc: "获取网页内容" },
      { name: "NotebookEditTool", instance: NotebookEditTool, desc: "编辑 Jupyter 笔记本" },
    ];
    for (const { name, instance, desc } of adapters) {
      map.set(name, {
        name,
        description: desc,
        parameters: { type: "object", properties: {} },
        validate(_params: unknown) { return { valid: true }; },
        async execute(params: unknown) {
          try {
            const result = await instance.call(params as never, {} as never, {} as never, {} as never);
            const raw = (result as { data?: unknown } | null)?.data ?? result;
            const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
            return { content };
          } catch (e) {
            const message = e instanceof Error ? e.message : "未知错误";
            return { content: `错误: ${message}` };
          }
        },
      });
    }
    return map;
  }

  async query(userMessage: string): Promise<QueryResult> {
    return this.messageLoop.run(userMessage);
  }

  async abort(): Promise<void> {
    this.abortController.abort()
    await this.stateMachine.transition("aborted_by_user");
  }

  /** UI 层调用：授予权限，解析 pending permission request promise */
  grantPermission(requestId: string): void {
    const entry = this.pendingRequests.get(requestId);
    if (entry) {
      entry.resolve(true);
      this.pendingRequests.delete(requestId);
    }
  }

  /** UI 层调用：拒绝权限，解析 pending permission request promise */
  denyPermission(requestId: string): void {
    const entry = this.pendingRequests.get(requestId);
    if (entry) {
      entry.resolve(false);
      this.pendingRequests.delete(requestId);
    }
  }

  getState(): string {
    return this.stateMachine.state;
  }

  getTools(): ToolDefinition[] {
    return this._toolDefinitions;
  }

  /**
   * 注入 API 客户端（用于自定义 HTTP 请求实现）
   * 允许外部提供自定义的 API 实现，避免直接访问内部 messageLoop
   */
  setApiClient(apiClient: { sendMessage: (request: unknown) => Promise<AsyncIterable<unknown>> }): void {
    // 通过内部引用更新 apiClient（MessageLoop 依赖注入模式）
    const loop = (this as unknown as { messageLoop: { deps: { apiClient: unknown } } }).messageLoop;
    if (loop) {
      loop.deps.apiClient = apiClient;
    }
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
