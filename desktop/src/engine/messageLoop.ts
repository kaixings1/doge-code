/**
 * engine/messageLoop.ts — 消息循环（文档 02 §2.2.2 / §4）
 *
 * 驱动：预算检查 → 构建请求 → 发送 API → 处理响应 → 执行工具 → 决定继续。
 */
function engineLog(prefix: string, ...args: unknown[]): void {
  // REQ/RESP 打印完整请求/响应 JSON，流式输出时刷屏严重，默认静音（仅 DOGE_DEBUG_SSE=1 时输出）
  if ((prefix === 'REQ' || prefix === 'RESP') && process.env.DOGE_DEBUG_SSE !== '1') {
    return
  }
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  console.log(`[${t}] [ENGINE:${prefix}]`, ...args)
}
import { QueryStateMachine } from "./stateMachine.ts";
import { TokenBudgetManager } from "./tokenBudgetManager.ts";
import { MessageNormalizer, type InternalMessage } from "./messageNormalizer.ts";
import { RequestBuilder } from "./requestBuilder.ts";
import { ResponseHandler } from "./responseHandler.ts";
import { ToolScheduler } from "./toolScheduler.ts";
import { ErrorClassifier } from "./errors/classifier.ts";
import { AutoCompactor } from "./autoCompactor.ts";
import { AutoFixLoop, type AutoFixLoopConfig } from "./autoFixLoop.ts";
import { GitContextInjector, type GitContextConfig } from "./gitContext.ts";

export interface QueryResult {
  state: string;
  messages: InternalMessage[];
  iterations: number;
  tokenUsage: unknown;
  duration: number;
}

/**
 * Agent 事件类型，对齐 OpenCode (Go) 的 AgentEvent。
 * 用于事件驱动的 UI 更新，解耦 Agent 循环和 UI 层。
 */
export type AgentEvent =
  | { type: 'iteration_start'; iteration: number }
  | { type: 'request_sent'; model: string }
  | { type: 'response_chunk'; content: string }
  | { type: 'tool_call_start'; toolUseId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'post_tool_use'; toolUseId: string; toolName: string; success: boolean; output?: string; error?: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'iteration_end'; iteration: number; hasToolCalls: boolean }
  | { type: 'done'; result: QueryResult }
  | { type: 'error'; error: string; stack?: string }
  | { type: 'aborted' }
  | { type: 'needs_user'; prompt?: string }
  | { type: 'should_continue' }
  | { type: 'pre_tool_use'; toolUseId: string; toolName: string; input: Record<string, unknown> }

export interface MessageLoopDeps {
  stateMachine: QueryStateMachine;
  tokenBudget: TokenBudgetManager;
  requestBuilder: RequestBuilder;
  responseHandler: ResponseHandler;
  toolScheduler: ToolScheduler;
  apiClient: { sendMessage: (req: unknown) => Promise<AsyncIterable<unknown>> };
  conversation: { messages: InternalMessage[]; addToolResults: (r: unknown[]) => void };
  systemPrompt: string;
  model: string;
  maxOutputTokens: number;
  toolDefinitions: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  provider: "anthropic" | "openai" | "google" | "azure" | "bedrock" | "vertexai" | "copilot" | "groq" | "openrouter" | "local" | "xai";
  /** 事件回调，用于 UI 层订阅 Agent 循环状态变化 */
  onEvent?: (event: AgentEvent) => void;
  /** 自动压缩器：在 token 预算接近上限时触发会话压缩 */
  autoCompactor?: AutoCompactor;
  /** 预测性 AI 助手：当前文件的静态分析建议 */
  preAnalysis?: Array<{ type: string; message: string; line?: number }>;
  /** 自动修复循环：在编辑工具成功后自动 lint→test→fix（吸收自 Aider） */
  autoFixLoop?: AutoFixLoopConfig;
  /** Git 上下文感知：编辑文件时自动获取 git blame + log 帮助理解代码意图（吸收自 Aider） */
  gitContext?: GitContextConfig;
}

export class MessageLoop {
  private maxIterations = 100;
  private currentIteration = 0;

  constructor(private deps: MessageLoopDeps) {
    // 确保 onEvent 始终有默认值
    if (!this.deps.onEvent) {
      this.deps.onEvent = () => {}
    }
    // 初始化自动修复循环（吸收自 Aider）
    if (this.deps.autoFixLoop?.enabled) {
      this.autoFixLoop = new AutoFixLoop({
        ...this.deps.autoFixLoop,
        onEvent: (event) => {
          engineLog('AUTOFIX', event.type)
          this.deps.autoFixLoop?.onEvent?.(event)
        },
      })
    }
    // 初始化 git 上下文感知（吸收自 Aider）
    if (this.deps.gitContext?.enabled) {
      this.gitContext = new GitContextInjector(this.deps.gitContext)
    }
  }

  private consecutiveToolFailures = 0;
  private consecutiveMaxTokens = 0;
  private autoFixLoop: AutoFixLoop | null = null;
  private gitContext: GitContextInjector | null = null;

  /** 重置自动修复循环计数器（新任务开始时调用） */
  resetAutoFixLoop(): void {
    this.autoFixLoop?.reset()
  }

  /** 重置 git 上下文轮次（新任务开始时调用） */
  resetGitContext(): void {
    this.gitContext = null
  }

  async run(userMessage: string): Promise<QueryResult> {
    // 新任务开始时重置自动修复循环和 git 上下文
    this.resetAutoFixLoop()
    this.resetGitContext()
    // 重置迭代计数，防止多次 run 之间累积导致过早触发 maxIterations
    this.currentIteration = 0
    this.deps.conversation.messages.push({ role: "user", content: userMessage } as InternalMessage);
    await this.deps.stateMachine.transition("responding", { message: userMessage });
    this.consecutiveToolFailures = 0;
    this.consecutiveMaxTokens = 0;

    const start = Date.now();
    while (this.deps.stateMachine.canContinue()) {
      this.currentIteration++;
      if (this.currentIteration > this.maxIterations) {
        await this.deps.stateMachine.transition("crashed", { reason: "超过最大迭代次数" });
        break;
      }
      this.deps.onEvent({ type: 'iteration_start', iteration: this.currentIteration });
      try {
        const shouldContinue = await this.runIteration();
        const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        console.log(`[${ts}] [LOOP] iter=${this.currentIteration}/${this.maxIterations} shouldContinue=${shouldContinue} state=${this.deps.stateMachine.state}`)
        if (!shouldContinue) {
          await this.deps.stateMachine.transition("done");
          break;
        }
        if (this.deps.stateMachine.state === "should_continue") {
          await this.deps.stateMachine.transition("responding");
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : '';
        const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        console.error(`[${ts}] [ENGINE] runIteration error: ${errMsg}`);
        console.error(`[${ts}] [ENGINE] stack: ${errStack}`);
        this.deps.onEvent({ type: 'error', error: errMsg, stack: errStack });
        if (this.deps.stateMachine.isTerminal()) break;
        await this.deps.stateMachine.transition("crashed", { error: ErrorClassifier.classify(error) });
        break;
      }
    }

    const result = {
      state: this.deps.stateMachine.state,
      messages: this.deps.conversation.messages,
      iterations: this.currentIteration,
      tokenUsage: this.deps.tokenBudget.getUsage(),
      duration: Date.now() - start,
    };
    this.deps.onEvent({ type: 'done', result });
    return result;
  }

  private async runIteration(): Promise<boolean> {
    const budget = this.deps.tokenBudget.checkBudget(this.deps.conversation.messages);
    if (budget.shouldReject) throw new Error(`Token limit exceeded: ${budget.percentage * 100}%`);
    if (budget.shouldCompact && this.deps.autoCompactor) {
      // 对齐 OpenCode agent.go Summarize：在 token 预算接近上限时自动压缩会话
      const before = this.deps.conversation.messages.length;
      this.deps.conversation.messages = await this.deps.autoCompactor.compact(this.deps.conversation.messages);
      const removed = before - this.deps.conversation.messages.length;
      if (removed > 0) {
        engineLog('COMPACT', `Compacted ${removed} messages due to budget limit`);
      }
    }

    const request = await this.deps.requestBuilder.build({
      messages: this.deps.conversation.messages,
      system: this.deps.systemPrompt,
      tools: this.deps.toolDefinitions,
      model: this.deps.model,
      maxTokens: this.deps.maxOutputTokens,
      provider: this.deps.provider,
      preAnalysis: this.deps.preAnalysis,
    });

    engineLog('REQ', JSON.stringify(request, null, 2).slice(0, 5000));

    const stream = await this.deps.apiClient.sendMessage(request);
    const processed = await this.deps.responseHandler.handle(stream as AsyncIterable<{ type: string; [k: string]: unknown }>);

    // 记录真实 API token 使用量用于成本追踪
    if (processed.usage) {
      this.deps.tokenBudget.recordUsage(processed.usage.inputTokens, processed.usage.outputTokens);
    }

    engineLog('RESP', JSON.stringify(processed, null, 2).slice(0, 10000));

    // 将助手回复写入 conversation，使下游能获取完整消息列表
    if (processed.content && processed.toolCalls.length === 0) {
      this.deps.conversation.messages.push({
        role: "assistant",
        content: processed.content,
      } as InternalMessage);
    } else if (processed.toolCalls.length > 0) {
      // 工具调用：推送含 tool_use 块的 assistant 消息，确保下一轮模型能看到完整历史
      const blocks: Array<Record<string, unknown>> = [];
      if (typeof processed.content === "string" && processed.content) {
        blocks.push({ type: "text", text: processed.content });
      }
      for (const tc of processed.toolCalls) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      this.deps.conversation.messages.push({
        role: "assistant",
        content: blocks,
      } as InternalMessage);
    }
    // 不在此处重置 consecutiveToolFailures——仅在工具成功执行后重置
    // 防止 AI 交替发送空文本回复和无效工具调用来绕过失败计数器

    if (processed.toolCalls.length > 0) {
      // 过滤掉无效的工具调用（空名称、幻觉名称）
      const availableTools = new Set(this.deps.toolDefinitions.map(t => t.name));
      const validCalls = processed.toolCalls.filter(tc => tc.name && availableTools.has(tc.name));
      const invalidCalls = processed.toolCalls.filter(tc => !tc.name || !availableTools.has(tc.name));

      // 始终累加无效调用次数（不因有效调用而重置）
      if (invalidCalls.length > 0) {
        this.consecutiveToolFailures += invalidCalls.length;
        const ts2 = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        engineLog('WARN', `${invalidCalls.length} invalid tool call(s) skipped. Valid: ${validCalls.length}, consecutive failures: ${this.consecutiveToolFailures}`);
      }

      // 如果全部无效，让 AI 用文本回答
      if (validCalls.length === 0) {
        this.deps.conversation.messages.push({
          role: "system",
          content: "Previous tool calls were invalid. Please answer directly without using tools.",
        } as InternalMessage);
        if (this.consecutiveToolFailures >= 2) {
          engineLog('WARN', 'Too many consecutive invalid tool calls, stopping');
          return false;
        }
        await this.deps.stateMachine.transition("should_continue");
        return true;
      }

      engineLog('TOOL_CALLS', JSON.stringify(validCalls, null, 2).slice(0, 10000));
      this.deps.onEvent({ type: 'request_sent', model: this.deps.model });

      // 发射工具调用开始事件
      for (const tc of validCalls) {
        this.deps.onEvent({
          type: 'tool_call_start',
          toolUseId: tc.id,
          toolName: tc.name,
          input: tc.input as Record<string, unknown>,
        });
      }

      // 发射 hook 事件：pre_tool_use（吸收自 Cline hooks.ts beforeTool）
      for (const tc of validCalls) {
        this.deps.onEvent({
          type: 'pre_tool_use',
          toolUseId: tc.id,
          toolName: tc.name,
          input: tc.input as Record<string, unknown>,
        });
      }

      // 执行有效调用
      const results = await this.deps.toolScheduler.execute(validCalls);

      engineLog('TOOL_RESULTS', JSON.stringify(results, null, 2).slice(0, 10000));

      // 发射 hook 事件：post_tool_use（吸收自 Cline hooks.ts afterTool）
      for (const r of results) {
        this.deps.onEvent({
          type: 'post_tool_use',
          toolUseId: r.toolUseId,
          toolName: validCalls.find(tc => tc.id === r.toolUseId)?.name ?? '',
          success: r.success,
          output: typeof r.output === 'string' ? r.output : JSON.stringify(r.output ?? ''),
          error: r.error,
        });
      }

      // 检查执行失败次数
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        this.consecutiveToolFailures += failedCount;
        engineLog('WARN', `${failedCount} tool call(s) failed, consecutive failures: ${this.consecutiveToolFailures}`);
      } else if (validCalls.length > 0) {
        // 全部成功时才重置计数器
        this.consecutiveToolFailures = 0;
      }

      // 连续失败达到阈值时停止
      if (this.consecutiveToolFailures >= 3) {
        engineLog('WARN', 'Too many consecutive tool failures, stopping tool loop');
        this.deps.conversation.messages.push({
          role: "system",
          content: "Tool calls are failing. Please answer directly without using tools.",
        } as InternalMessage);
        return false;
      }

      this.deps.conversation.addToolResults(results);

      // Git 上下文感知：为编辑的文件注入 git blame + log（吸收自 Aider）
      if (this.gitContext) {
        const editedFiles = this.gitContext.extractFiles(
          results.map(r => ({ toolUseId: r.toolUseId, success: r.success, output: r.output })),
        )
        if (editedFiles.length > 0) {
          const gitMessages = await this.gitContext.injectForFiles(editedFiles, '')
          for (const msg of gitMessages) {
            this.deps.conversation.messages.push(msg as InternalMessage)
          }
        }
      }

      // 自动修复循环：编辑工具成功后自动 lint→test→fix（吸收自 Aider）
      if (this.autoFixLoop) {
        const fixMessages = await this.autoFixLoop.maybeRun(results)
        for (const msg of fixMessages) {
          this.deps.conversation.messages.push(msg as InternalMessage)
        }
      }

      this.deps.onEvent({ type: 'iteration_end', iteration: this.currentIteration, hasToolCalls: true });
      await this.deps.stateMachine.transition("should_continue");
      return true;
    }

    // 无工具调用的回合结束
    this.deps.onEvent({ type: 'iteration_end', iteration: this.currentIteration, hasToolCalls: false });

    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    console.log(`[${ts}] [LOOP] no-tool round: stopReason=${processed.stopReason} needsUserInput=${processed.needsUserInput} contentLen=${typeof processed.content === 'string' ? processed.content.length : JSON.stringify(processed.content).length}`)

    if (processed.needsUserInput) {
      this.deps.onEvent({ type: 'needs_user', prompt: processed.content as string });
      return true;
    }

    if (processed.stopReason === "end_turn") return false;
    if (processed.stopReason === "max_tokens") {
      // 连续 max_tokens 保护：某些模型/代理一直返回 length，
      // 若连续 3 次无进展（无工具调用且 max_tokens），强制结束，避免无限循环
      this.consecutiveMaxTokens++;
      if (this.consecutiveMaxTokens >= 3) {
        const ts2 = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        console.log(`[${ts2}] [LOOP] consecutive max_tokens reached ${this.consecutiveMaxTokens}, stopping loop`)
        this.consecutiveMaxTokens = 0
        return false;
      }
      await this.deps.stateMachine.transition("should_continue");
      return true;
    }
    return false;
  }
}