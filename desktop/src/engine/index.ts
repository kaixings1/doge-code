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
import { AutoFixLoop } from "./autoFixLoop.ts";
import { GitContextInjector, type GitContextConfig } from "./gitContext.ts";
// 导入工具注册表（复用 src/tools.ts 中 buildTool() 构建的完整工具实例）
import { getAllBaseTools } from "../tools.js";
import { type Tools, type ToolInfo } from "../Tool.js";
// 导入新功能模块
import { getEndConversationManager } from "../features/endConversation.js";
import { getSubAgentManager } from "../features/featureFlags.js";
import { getAutoModeManager } from "../features/additionalFeatures.js";
import { getForwardSubagentTextManager } from "../features/additionalFeatures.js";

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
  /** 预测性 AI 助手：当前文件的静态分析建议 */
  preAnalysis?: Array<{ type: string; message: string; line?: number }>;
  /** 自动修复循环配置（吸收自 Aider）：编辑工具后自动 lint→test→fix */
  autoFixLoop?: {
    enabled?: boolean
    maxIterations?: number
  };
  /** Git 上下文感知配置（吸收自 Aider）：编辑文件时自动获取 git blame + log */
  gitContext?: GitContextConfig;
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
  private _preAnalysis: Array<{ type: string; message: string; line?: number }>;
  readonly conversation: Conversation;
  private abortController: AbortController = new AbortController();

  private messageLoop: MessageLoop;
  private _toolDefinitions: ToolDefinition[] = [];
  private pendingRequests = new Map<string, { resolve: (v: boolean) => void }>();
  private _conversation: Conversation = {
    messages: [],
    addToolResults: (results) => {
      for (const r of results) {
        const resultRecord = r as Record<string, unknown>;
        const toolUseId = typeof resultRecord.toolUseId === 'string' ? resultRecord.toolUseId : null;
        const contentVal = typeof resultRecord.output === 'string' ? resultRecord.output : JSON.stringify(resultRecord.output ?? resultRecord.error ?? '');
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
    this._preAnalysis = opts.preAnalysis;
    const autoFixLoopConfig = opts.autoFixLoop;

    // 初始化新功能管理器
    const endConvManager = getEndConversationManager();
    const subAgentMgr = getSubAgentManager();
    const autoModeMgr = getAutoModeManager();

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
      preAnalysis: this._preAnalysis,
      autoFixLoop: {
        enabled: autoFixLoopConfig?.enabled ?? true,
        maxIterations: autoFixLoopConfig?.maxIterations ?? 3,
        onEvent: (event) => {
          engineLog('AUTOFIX', event.type)
        },
      },
      gitContext: opts.gitContext,
    };
    this.messageLoop = new MessageLoop(deps);

    // 注入 API client 到 AutoCompactor，使 SummaryStrategy 能通过 LLM 生成真实摘要
    this.autoCompactor.setApiClient({
      sendMessage: deps.apiClient.sendMessage.bind(deps.apiClient),
    });
  }

  /**
   * 构建最小化的 ToolUseContext，用于工具内部的 validateInput/call 调用。
   * 不依赖 UI 层，所有权限检查由引擎外部的 PermissionManager 处理。
   */
  private static buildMinimalContext() {
    const abortController = new AbortController();
    return {
      options: {
        commands: [],
        debug: false,
        mainLoopModel: '',
        tools: [] as Tools,
        verbose: false,
        thinkingConfig: { type: 'none' as const },
        mcpClients: [],
        mcpResources: {},
        isNonInteractiveSession: true,
        agentDefinitions: [],
      },
      abortController,
      getAppState: () => ({ toolPermissionContext: {} as Record<string, unknown> }),
      setAppState: () => {},
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => 0,
      updateFileHistoryState: (f: any) => f,
      updateAttributionState: (f: any) => f,
      readFileState: { get: () => null, set: () => {}, has: () => false },
    };
  }

  private buildRegistry(): Map<string, Tool> {
    const map = new Map<string, Tool>();
    const baseTools = getAllBaseTools();
    // 复用最小上下文和始终允许的 canUseTool
    const ctx = QueryEngine.buildMinimalContext();
    const canUseTool = (async (_tool: unknown, _input: unknown, _ctx: unknown, _msg: unknown, _id: unknown) => ({ behavior: 'allow', updatedInput: {} as Record<string, unknown> })) as (tool: unknown, input: unknown, ctx: unknown, msg: unknown, id: unknown) => Promise<{ behavior: string; updatedInput: Record<string, unknown> }>;
    const parentMessage = { role: 'user', content: '' } as Record<string, unknown>;

    for (const tool of baseTools) {
      if (!tool || !tool.name) continue;
      const info = tool.info();
      map.set(tool.name, {
        name: info.name,
        description: info.description,
        parameters: info.parameters,
        validate() {
          return { valid: true };
        },
        async execute(params) {
          try {
            // 调用真实工具的 call() 方法获取完整执行结果
            const result = await tool.call(
              params as Record<string, unknown>,
              ctx as Record<string, unknown>,
              canUseTool,
              parentMessage,
            );
            // 解包 { data: ... } 包装，提取输出内容
            const raw = (result as { data?: unknown } | null)?.data ?? result;
            if (typeof raw === 'string') return { content: raw };
            if (typeof raw === 'object' && raw !== null) {
              const obj = raw as Record<string, unknown>;
              const content = obj.stdout ?? obj.content ?? JSON.stringify(raw);
              return { content: String(content) };
            }
            return { content: String(raw ?? '') };
          } catch (e) {
            const message = e instanceof Error ? e.message : '未知错误';
            return { content: `错误: ${message}` };
          }
        },
      });
    }
    return map;
  }

  async query(userMessage: string): Promise<QueryResult> {
    // EndConversation 安全检查
    const endConvManager = getEndConversationManager()
    const check = endConvManager.checkInput(userMessage)
    if (check.shouldEnd) {
      return {
        type: 'ended' as const,
        output: endConvManager.getEndMessage(),
        reason: check.reason,
      }
    }
    if (check.shouldWarn) {
      // 将警告注入对话
      this._conversation.messages.push({
        role: 'assistant' as const,
        content: endConvManager.getWarningMessage(),
      })
    }
    return this.messageLoop.run(userMessage);
  }

  async abort(): Promise<void> {
    this.abortController.abort()
    if (this.stateMachine.state === "aborted_by_user") return
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
   * 注入预测性 AI 助手的静态分析结果
   * 由主进程在发送消息前设置，注入到 system prompt
   */
  setPreAnalysis(preAnalysis: Array<{ type: string; message: string; line?: number }>): void {
    this._preAnalysis = preAnalysis;
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
export * from "./repoMap.ts";
export * from "./coders/index.ts";
