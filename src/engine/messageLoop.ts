/**
 * engine/messageLoop.ts — 消息循环（文档 02 §2.2.2 / §4）
 *
 * 驱动：预算检查 → 构建请求 → 发送 API → 处理响应 → 执行工具 → 决定继续。
 */
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
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
}

export class MessageLoop {
  private maxIterations = 100;
  private currentIteration = 0;

  constructor(private deps: MessageLoopDeps) {}

  async run(userMessage: string): Promise<QueryResult> {
    this.deps.conversation.messages.push({ role: "user", content: userMessage } as InternalMessage);
    await this.deps.stateMachine.transition("responding", { message: userMessage });

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
        console.error(`[ENGINE] runIteration error: ${errMsg}`);
        console.error(`[ENGINE] stack: ${errStack}`);
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

    const stream = await this.deps.apiClient.sendMessage(request);
    const processed = await this.deps.responseHandler.handle(stream as AsyncIterable<{ type: string; [k: string]: unknown }>);

    // 将助手回复写入 conversation，使下游能获取完整消息列表
    if (processed.content && processed.toolCalls.length === 0) {
      this.deps.conversation.messages.push({
        role: "assistant",
        content: processed.content,
      } as InternalMessage);
    }

    if (processed.toolCalls.length > 0) {
      const results = await this.deps.toolScheduler.execute(processed.toolCalls);
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