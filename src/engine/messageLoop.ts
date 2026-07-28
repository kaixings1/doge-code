/**
 * engine/messageLoop.ts — 消息循环（文档 02 §2.2.2 / §4）
 *
 * 驱动：预算检查 → 构建请求 → 发送 API → 处理响应 → 执行工具 → 决定继续。
 */
function engineLog(prefix: string, ...args: unknown[]): void {
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

export interface QueryResult {
  state: string;
  messages: InternalMessage[];
  iterations: number;
  tokenUsage: unknown;
  duration: number;
}

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
}

export class MessageLoop {
  private maxIterations = 100;
  private currentIteration = 0;

  constructor(private deps: MessageLoopDeps) {}

  private consecutiveToolFailures = 0;

  async run(userMessage: string): Promise<QueryResult> {
    this.deps.conversation.messages.push({ role: "user", content: userMessage } as InternalMessage);
    await this.deps.stateMachine.transition("responding", { message: userMessage });
    this.consecutiveToolFailures = 0;

    const start = Date.now();
    while (this.deps.stateMachine.canContinue()) {
      this.currentIteration++;
      if (this.currentIteration > this.maxIterations) {
        await this.deps.stateMachine.transition("crashed", { reason: "超过最大迭代次数" });
        break;
      }
      try {
        const shouldContinue = await this.runIteration();
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
        if (this.deps.stateMachine.isTerminal()) break;
        await this.deps.stateMachine.transition("crashed", { error: ErrorClassifier.classify(error) });
        break;
      }
    }

    return {
      state: this.deps.stateMachine.state,
      messages: this.deps.conversation.messages,
      iterations: this.currentIteration,
      tokenUsage: this.deps.tokenBudget.getUsage(),
      duration: Date.now() - start,
    };
  }

  private async runIteration(): Promise<boolean> {
    const budget = this.deps.tokenBudget.checkBudget(this.deps.conversation.messages);
    if (budget.shouldReject) throw new Error(`Token limit exceeded: ${budget.percentage * 100}%`);
    if (budget.shouldCompact) {
      // 占位：触发自动压缩 conversation
    }

    const request = await this.deps.requestBuilder.build({
      messages: this.deps.conversation.messages,
      system: this.deps.systemPrompt,
      tools: this.deps.toolDefinitions,
      model: this.deps.model,
      maxTokens: this.deps.maxOutputTokens,
    });

    engineLog('REQ', JSON.stringify(request, null, 2).slice(0, 5000));

    const stream = await this.deps.apiClient.sendMessage(request);
    const processed = await this.deps.responseHandler.handle(stream as AsyncIterable<{ type: string; [k: string]: unknown }>);

    engineLog('RESP', JSON.stringify(processed, null, 2).slice(0, 10000));

    // 将助手回复写入 conversation，使下游能获取完整消息列表
    if (processed.content && processed.toolCalls.length === 0) {
      this.deps.conversation.messages.push({
        role: "assistant",
        content: processed.content,
      } as InternalMessage);
      // 不在此处重置 consecutiveToolFailures——仅在工具成功执行后重置
      // 防止 AI 交替发送空文本回复和无效工具调用来绕过失败计数器
    }

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

      // 执行有效调用
      const results = await this.deps.toolScheduler.execute(validCalls);

      engineLog('TOOL_RESULTS', JSON.stringify(results, null, 2).slice(0, 10000));

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
      await this.deps.stateMachine.transition("should_continue");
      return true;
    }

    if (processed.needsUserInput) {
      await this.deps.stateMachine.transition("needs_user", { prompt: processed.content });
      return true;
    }

    if (processed.stopReason === "end_turn") return false;
    if (processed.stopReason === "max_tokens") {
      await this.deps.stateMachine.transition("should_continue");
      return true;
    }
    return false;
  }
}