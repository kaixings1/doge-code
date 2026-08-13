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
import { RequestBuilder, type HarnessConfig } from "./requestBuilder.ts";
import { ResponseHandler, type ProcessedResponse } from "./responseHandler.ts";
import { ToolScheduler } from "./toolScheduler.ts";
import { ErrorClassifier } from "./errors/classifier.ts";
import { AutoCompactor } from "./autoCompactor.ts";
import { AutoFixLoop, type AutoFixLoopConfig } from "./autoFixLoop.ts";
import { cleanupHistoryBase64, applyPhase2Degradation, DEFAULT_IMAGE_BUDGET_CONFIG, type ImageBudgetConfig } from "./imageBudgetGuard.ts";
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
  | { type: 'permission_request'; id: string; toolName: string; input: Record<string, unknown>; description?: string }
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
  /** 图片预算守卫配置（吸收自 zhikuncode TokenBudgetGuard）：请求前清理历史图片 Base64 + 梯度降级 */
  imageBudget?: Partial<ImageBudgetConfig>;
  /** Harness 模型适配配置（吸收自 open-interpreter harness）：多 provider 格式转换 */
  harness?: import("./harnessAdapter.ts").HarnessConfig;
  /** 验收标准门控（吸收自 intent-driven-development）：进入 done 前检查所有 required 标准 */
  acceptanceGate?: { check: () => Promise<{ allRequiredPass: boolean }> };
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
        readFile: this.deps.autoFixLoop.readFile ?? (async (file: string) => {
          // fallback：尝试通过 fs/promises 读取
          const { readFile } = await import('fs/promises')
          return readFile(file, 'utf-8')
        }),
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
      this.deps.onEvent({ type: 'iteration_start', iteration: this.currentIteration });
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
        // Ctrl+C 中断回填：防止 assistant 的 tool_calls 缺少匹配的 tool 回复
        if (error instanceof Error && error.message === 'INTERRUPT') {
          this._backfillPendingToolCalls();
          this.deps.onEvent({ type: 'aborted' });
          break;
        }
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : '';
        const ts2 = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        console.error(`[${ts2}] [ENGINE] runIteration error: ${errMsg}`);
        console.error(`[${ts2}] [ENGINE] stack: ${errStack}`);
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

  /** Ctrl+C 中断时，为未收到 tool reply 的 tool_call 补全占位回复（CoreCoder 模式） */
  private _backfillPendingToolCalls(): void {
    const lastAssistant = [...this.deps.conversation.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant || typeof lastAssistant.content !== 'object') return;
    const blocks = lastAssistant.content as Array<Record<string, unknown>>;
    const toolCallIds = blocks.filter(b => b.type === 'tool_use').map(b => b.id as string);
    if (toolCallIds.length === 0) return;

    const answered = new Set(
      this.deps.conversation.messages
        .filter(m => m.role === 'tool')
        .map(m => (m as { tool_call_id?: string }).tool_call_id as string)
    );
    for (const id of toolCallIds) {
      if (!answered.has(id)) {
        this.deps.conversation.messages.push({
          role: 'tool',
          tool_call_id: id,
          content: '[interrupted]',
        } as InternalMessage);
      }
    }
    console.log('[ENGINE] Backfilled interrupted tool calls to preserve message history integrity');
  }

  /** 将助手回复写入 conversation，并决定是否继续（吸收自 CoreCoder agent.py） */
  private async _recordAssistantResponse(processed: ProcessedResponse): Promise<boolean> {
    if (processed.content && processed.toolCalls.length === 0) {
      this.deps.conversation.messages.push({
        role: 'assistant',
        content: processed.content,
      } as InternalMessage);
    } else if (processed.toolCalls.length > 0) {
      const blocks: Array<Record<string, unknown>> = [];
      if (typeof processed.content === 'string' && processed.content) {
        blocks.push({ type: 'text', text: processed.content });
      }
      for (const tc of processed.toolCalls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      this.deps.conversation.messages.push({
        role: 'assistant',
        content: blocks,
      } as InternalMessage);
    }

    if (processed.needsUserInput) {
      this.deps.onEvent({ type: 'needs_user', prompt: processed.content as string });
      return true;
    }
    if (processed.stopReason === 'end_turn') return false;
    if (processed.stopReason === 'max_tokens') {
      this.deps.onEvent({ type: 'should_continue' });
      return true;
    }

    // 自动继续：当 AI 回复正文包含"是否继续"等关键词时，延迟 3 秒后自动注入"继续"
    const content = typeof processed.content === 'string' ? processed.content : '';
    if (content && /是否继续|是否需要|是否同意|需要我|继续吗|确认一下|要不要|需不需要|可不可以|行不行|能不能|是否可以|是否要|是否需|可以吗|开始吗|同意吗|确认吗|有问题吗|没问题吧|没问题|请问|是不是|对不对|可否|是否可行|是否|继续|需要|确认|同意|能否|好吗|行吗/.test(content)) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      this.deps.conversation.messages.push({
        role: 'user',
        content: '继续',
      } as InternalMessage);
      engineLog('AUTO_CONTINUE', '检测到"是否继续"关键词，3秒后自动发送"继续"');
      return true;
    }

    return false;
  }

  /** 执行单个迭代：构建请求 → 获取响应 → 处理工具调用 */
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

    // 图片预算守卫（吸收自 zhikuncode TokenBudgetGuard）：请求前清理历史图片 Base64 + 梯度降级
    const imageBudgetCfg = { ...DEFAULT_IMAGE_BUDGET_CONFIG, ...this.deps.imageBudget };
    const phase1 = cleanupHistoryBase64(this.deps.conversation.messages, imageBudgetCfg.historyBase64TokenThreshold);
    const phase2 = applyPhase2Degradation(phase1.messages, imageBudgetCfg);
    if (phase1.clearedCount > 0 || phase2.degraded.length > 0) {
      this.deps.conversation.messages = phase2.messages;
      if (phase1.clearedCount > 0) {
        engineLog('IMAGE-BUDGET', `Cleared ${phase1.clearedCount} oversized image refs from history`);
      }
      if (phase2.degraded.length > 0) {
        engineLog('IMAGE-BUDGET', `Degraded ${phase2.degraded.length} images: ${phase2.degraded.join('; ')}`);
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
      harness: this.deps.harness,
    });

    engineLog('REQ', JSON.stringify(request, null, 2).slice(0, 5000));

    const stream = await this.deps.apiClient.sendMessage(request);
    const processed = await this.deps.responseHandler.handle(stream as AsyncIterable<{ type: string; [k: string]: unknown }>);

    // 记录真实 API token 使用量用于成本追踪
    if (processed.usage) {
      this.deps.tokenBudget.recordUsage(processed.usage.inputTokens, processed.usage.outputTokens);
    }

    engineLog('RESP', JSON.stringify(processed, null, 2).slice(0, 10000));

    // 将助手回复写入 conversation 并决定是否继续（吸收自 CoreCoder agent.py）
    let shouldContinue = await this._recordAssistantResponse(processed);

    // 验收标准门控（吸收自 intent-driven-development）：进入 done 前检查所有 required 标准
    if (!shouldContinue && this.deps.acceptanceGate) {
      const gateResult = await this.deps.acceptanceGate.check()
      if (!gateResult.allRequiredPass) {
        engineLog('ACCEPTANCE', 'Required acceptance criteria not met, continuing to fix')
        this.deps.onEvent({
          type: 'should_continue',
        })
        shouldContinue = true
      }
    }

    if (!shouldContinue) {
      return false;
    }
    this.deps.conversation.messages.push({
      role: "system",
      content: "Continuing to next iteration.",
    } as InternalMessage);

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

      // 熔断器记录（吸收自 error-coordinator）：每个工具的成功/失败计入熔断器
      if (this.deps.recovery) {
        for (const r of results) {
          const toolName = validCalls.find(tc => tc.id === r.toolUseId)?.name ?? 'unknown'
          if (r.success) {
            this.deps.recovery.recordToolSuccess(toolName)
          } else {
            this.deps.recovery.recordToolFailure(toolName)
          }
        }
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
        // 优先使用并行验证模式（吸收自 code-change-verification skill）
        if (this.deps.autoFixLoop.runVerification) {
          const verificationSteps = this.buildVerificationSteps(results)
          if (verificationSteps.length > 0) {
            const verificationResults = await this.autoFixLoop.runParallelVerification(verificationSteps)
            const failedResults = verificationResults.filter((r) => !r.success)
            if (failedResults.length > 0) {
              // 将结构化验证结果注入对话，驱动自动修复
              const verificationMsg = this.formatVerificationErrors(failedResults)
              this.deps.conversation.messages.push({ role: 'user', content: verificationMsg } as InternalMessage)
            }
          }
        } else {
          // fallback：传统模式，从工具输出中检测错误
          const fixMessages = await this.autoFixLoop.maybeRun(results)
          for (const msg of fixMessages) {
            this.deps.conversation.messages.push(msg as InternalMessage)
          }
        }

        // De-Sloppify 清理通道：在修复循环完成后执行一次（吸收自 ECC autonomous-loops）
        const editedFiles = this.autoFixLoop.extractEditedFiles(results)
        if (editedFiles.length > 0) {
          const cleanupResults = await this.autoFixLoop.cleanupPhase(editedFiles)
          if (cleanupResults.length > 0) {
            const cleanupMsg = `[De-Sloppify] 检测到 ${cleanupResults.length} 处代码质量问题：\n${cleanupResults.slice(0, 20).join('\n')}\n\n请评估是否需要清理。`
            this.deps.conversation.messages.push({ role: 'user', content: cleanupMsg } as InternalMessage)
          }
        }
      }

      this.deps.onEvent({ type: 'iteration_end', iteration: this.currentIteration, hasToolCalls: true });
      await this.deps.stateMachine.transition("should_continue");
      return true;
    }

    // 无工具调用的回合结束
    this.deps.onEvent({ type: 'iteration_end', iteration: this.currentIteration, hasToolCalls: false });

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

  /** 根据编辑的文件构建验证步骤列表（吸收自 code-change-verification skill） */
  private buildVerificationSteps(results: Array<{ toolUseId: string; success: boolean; output?: unknown; error?: string }>): Array<{ name: string; command: string; required: boolean }> {
    const files = this.autoFixLoop?.extractEditedFiles(results) ?? []
    if (files.length === 0) return []

    const steps: Array<{ name: string; command: string; required: boolean }> = []

    // 检测项目类型，选择对应的验证命令
    const hasPackageJson = files.some((f) => f.includes('package.json'))
    const hasPyproject = files.some((f) => f.includes('pyproject.toml') || f.includes('setup.py'))
    const hasCargoToml = files.some((f) => f.includes('Cargo.toml'))
    const hasGoMod = files.some((f) => f.includes('go.mod'))

    if (hasPackageJson) {
      steps.push({ name: 'lint', command: 'npx eslint . --max-warnings 0', required: true })
      steps.push({ name: 'test', command: 'npm test', required: true })
    } else if (hasPyproject || hasCargoToml || hasGoMod) {
      steps.push({ name: 'lint', command: 'echo "lint step for detected project type"', required: true })
      steps.push({ name: 'test', command: 'echo "test step for detected project type"', required: true })
    }

    return steps
  }

  /** 将验证失败结果格式化为注入对话的消息 */
  private formatVerificationErrors(results: Array<{ step: { name: string; command: string }; output: string; durationMs: number }>): string {
    const lines = [
      '❌ 错误: [并行验证失败] 以下验证步骤未通过，请修复：',
      '',
    ]

    for (const r of results) {
      lines.push(`❌ ${r.step.name} (${r.durationMs}ms)`)
      lines.push(`   命令: ${r.step.command}`)
      const outputLines = r.output.split('\n').slice(0, 20)
      lines.push(`   输出:\n${outputLines.map((l) => `     ${l}`).join('\n')}`)
      lines.push('')
    }

    return lines.join('\n')
  }
}