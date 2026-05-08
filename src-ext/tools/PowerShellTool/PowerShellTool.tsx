import { feature } from 'bun:bundle';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import { copyFile, stat as fsStat, truncate as fsTruncate, link } from 'fs/promises';
import * as React from 'react';
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js';
import type { AppState } from '../../state/AppState.js';
import { z } from 'zod/v4';
import { getKairosActive } from '../../bootstrap/state.js';
import { TOOL_SUMMARY_MAX_LENGTH } from '../../constants/toolLimits.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../../services/analytics/index.js';
import type { SetToolJSXFn, Tool, ToolCallProgress, ValidationResult } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { backgroundExistingForegroundTask, markTaskNotified, registerForeground, spawnShellTask, unregisterForeground } from '../../tasks/LocalShellTask/LocalShellTask.js';
import type { AgentId } from '../../types/ids.js';
import type { AssistantMessage } from '../../types/message.js';
import { extractClaudeCodeHints } from '../../utils/claudeCodeHints.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { errorMessage as getErrorMessage, ShellError } from '../../utils/errors.js';
import { truncate } from '../../utils/format.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { logError } from '../../utils/log.js';
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js';
import { getPlatform } from '../../utils/platform.js';
import { maybeRecordPluginHint } from '../../utils/plugins/hintRecommendation.js';
import { exec } from '../../utils/Shell.js';
import type { ExecResult } from '../../utils/ShellCommand.js';
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js';
import { semanticBoolean } from '../../utils/semanticBoolean.js';
import { semanticNumber } from '../../utils/semanticNumber.js';
import { getCachedPowerShellPath } from '../../utils/shell/powershellDetection.js';
import { EndTruncatingAccumulator } from '../../utils/stringUtils.js';
import { getTaskOutputPath } from '../../utils/task/diskOutput.js';
import { TaskOutput } from '../../utils/task/TaskOutput.js';
import { isOutputLineTruncated } from '../../utils/terminal.js';
import { buildLargeToolResultMessage, ensureToolResultsDir, generatePreview, getToolResultPath, PREVIEW_SIZE_BYTES } from '../../utils/toolResultStorage.js';
import { shouldUseSandbox } from '../BashTool/shouldUseSandbox.js';
import { BackgroundHint } from '../BashTool/UI.js';
import { buildImageToolResult, isImageOutput, resetCwdIfOutsideProject, resizeShellImageOutput, stdErrAppendShellResetMessage, stripEmptyLines } from '../BashTool/utils.js';
import { trackGitOperations } from '../shared/gitOperationTracking.js';
import { interpretCommandResult } from './commandSemantics.js';
import { powershellToolHasPermission } from './powershellPermissions.js';
import { getDefaultTimeoutMs, getMaxTimeoutMs, getPrompt } from './prompt.js';
import { hasSyncSecurityConcerns, isReadOnlyCommand, resolveToCanonical } from './readOnlyValidation.js';
import { POWERSHELL_TOOL_NAME } from './toolName.js';
import { renderToolResultMessage, renderToolUseErrorMessage, renderToolUseMessage, renderToolUseProgressMessage, renderToolUseQueuedMessage } from './UI.js';

// 切勿对终端输出使用 os.EOL —— Windows 上的 \r\n 会破坏 Ink 渲染
const EOL = '\n';

/**
 * PowerShell 搜索命令（等效于 grep）用于可折叠显示。
 * 存储为标准形式（小写）的 cmdlet 名称。
 */
const PS_SEARCH_COMMANDS = new Set(['select-string',
// 等效于 grep
'get-childitem',
// 等效于 find（使用 -Recurse）
'findstr',
// 原生 Windows 搜索
'where.exe' // 原生 Windows which 命令
]);

/**
 * PowerShell 读取/查看命令用于可折叠显示。
 * 存储为标准形式（小写）的 cmdlet 名称。
 */
const PS_READ_COMMANDS = new Set(['get-content',
// 等效于 cat
'get-item',
// 文件信息
'test-path',
// 等效于 test -e
'resolve-path',
// 等效于 realpath
'get-process',
// 等效于 ps
'get-service',
// 系统信息
'get-childitem',
// 等效于 ls/dir（递归时也是搜索）
'get-location',
// 等效于 pwd
'get-filehash',
// 校验和
'get-acl',
// 权限信息
'format-hex' // 等效于 hexdump
]);

/**
 * 不改变搜索/读取性质的 PowerShell 语义中性命令。
 */
const PS_SEMANTIC_NEUTRAL_COMMANDS = new Set(['write-output',
// 等效于 echo
'write-host']);

/**
 * 检查 PowerShell 命令是否为搜索或读取操作。
 * 用于判断命令在 UI 中是否应被折叠。
 */
function isSearchOrReadPowerShellCommand(command: string): {
  isSearch: boolean;
  isRead: boolean;
} {
  const trimmed = command.trim();
  if (!trimmed) {
    return {
      isSearch: false,
      isRead: false
    };
  }

  // 简单分割语句分隔符和管道操作符
  // 这是一个同步函数，因此我们采用轻量级方法
  const parts = trimmed.split(/\s*[;|]\s*/).filter(Boolean);
  if (parts.length === 0) {
    return {
      isSearch: false,
      isRead: false
    };
  }
  let hasSearch = false;
  let hasRead = false;
  let hasNonNeutralCommand = false;
  for (const part of parts) {
    const baseCommand = part.trim().split(/\s+/)[0];
    if (!baseCommand) {
      continue;
    }
    const canonical = resolveToCanonical(baseCommand);
    if (PS_SEMANTIC_NEUTRAL_COMMANDS.has(canonical)) {
      continue;
    }
    hasNonNeutralCommand = true;
    const isPartSearch = PS_SEARCH_COMMANDS.has(canonical);
    const isPartRead = PS_READ_COMMANDS.has(canonical);
    if (!isPartSearch && !isPartRead) {
      return {
        isSearch: false,
        isRead: false
      };
    }
    if (isPartSearch) hasSearch = true;
    if (isPartRead) hasRead = true;
  }
  if (!hasNonNeutralCommand) {
    return {
      isSearch: false,
      isRead: false
    };
  }
  return {
    isSearch: hasSearch,
    isRead: hasRead
  };
}

// 进度显示常量
const PROGRESS_THRESHOLD_MS = 2000;
const PROGRESS_INTERVAL_MS = 1000;
// 在助手模式下，阻塞命令在主代理中超过此毫秒数后会自动转入后台
const ASSISTANT_BLOCKING_BUDGET_MS = 15_000;

// 不应自动转入后台的命令（标准形式小写）。
// 'sleep' 是 Start-Sleep 的 PS 内置别名，但不在 COMMON_ALIASES 中，
// 因此将两种形式都列出。
const DISALLOWED_AUTO_BACKGROUND_COMMANDS = ['start-sleep',
// Start-Sleep 应在前台运行，除非明确指定后台运行
'sleep'];

/**
 * 检查命令是否允许自动转入后台
 * @param command 要检查的命令
 * @returns 对于不应自动转入后台的命令（如 Start-Sleep）返回 false
 */
function isAutobackgroundingAllowed(command: string): boolean {
  const firstWord = command.trim().split(/\s+/)[0];
  if (!firstWord) return true;
  const canonical = resolveToCanonical(firstWord);
  return !DISALLOWED_AUTO_BACKGROUND_COMMANDS.includes(canonical);
}

/**
 * BashTool 的 detectBlockedSleepPattern 的 PowerShell 风格移植。
 * 捕获作为第一个语句的 `Start-Sleep N`、`Start-Sleep -Seconds N`、`sleep N`（内置别名）。
 * 不阻止 `Start-Sleep -Milliseconds`（亚秒级步进没问题）或浮点秒数（合法的速率限制）。
 */
export function detectBlockedSleepPattern(command: string): string | null {
  // 仅第一个语句 — 按 PS 语句分隔符分割：`;`、`|`、
  // `&`/`&&`/`||`（pwsh 7+），以及换行符（PS 的主要分隔符）。这是有意为之的浅层检测 —
  // 脚本块、子 shell 或后续管道阶段中的 sleep 不受影响。匹配 BashTool 的 splitCommandWithOperators
  // 意图（src/utils/bash/commands.ts），但不使用完整的 PS 解析器。
  const first = command.trim().split(/[;|&\r\n]/)[0]?.trim() ?? '';
  // 匹配：Start-Sleep N、Start-Sleep -Seconds N、Start-Sleep -s N、sleep N
  // （不区分大小写；-Seconds 按 PS 惯例可缩写为 -s）
  const m = /^(?:start-sleep|sleep)(?:\s+-s(?:econds)?)?\s+(\d+)\s*$/i.exec(first);
  if (!m) return null;
  const secs = parseInt(m[1]!, 10);
  if (secs < 2) return null; // 少于 2 秒的 sleep 没问题（速率限制、步进）

  const rest = command.trim().slice(first.length).replace(/^[\s;|&]+/, '');
  return rest ? `Start-Sleep ${secs} followed by: ${rest}` : `独立的 Start-Sleep ${secs}`;
}

/**
 * 在 Windows 原生环境下，沙箱不可用（bwrap/sandbox-exec 仅限 POSIX）。
 * 如果企业策略启用了 sandbox.enabled 且禁止未沙箱化的命令，PowerShell 无法遵守 —
 * 拒绝执行而不是悄悄绕过策略。在 Linux/macOS/WSL2 上，pwsh
 * 作为原生二进制文件在沙箱下运行，与 bash 相同，因此此门禁不适用。
 *
 * 在 validateInput（工具运行器干净报错）和 call()
 * （覆盖跳过 validateInput 的直接调用者，如 promptShellExecution.ts）中都会检查。
 * call() 中的守卫是真正起作用的。
 */
const WINDOWS_SANDBOX_POLICY_REFUSAL = '企业策略要求沙箱化，但沙箱化在原生 Windows 上不可用。根据策略，此平台上的 Shell 命令执行被阻止。';
function isWindowsSandboxPolicyViolation(): boolean {
  return getPlatform() === 'windows' && SandboxManager.isSandboxEnabledInSettings() && !SandboxManager.areUnsandboxedCommandsAllowed();
}

// 在模块加载时检查后台任务是否被禁用
const isBackgroundTasksDisabled =
// eslint-disable-next-line custom-rules/no-process-env-top-level -- 有意为之：模式必须在模块加载时定义
isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS);
const fullInputSchema = lazySchema(() => z.strictObject({
  command: z.string().describe('要执行的 PowerShell 命令'),
  timeout: semanticNumber(z.number().optional()).describe(`可选超时时间，单位毫秒（最大 ${getMaxTimeoutMs()}）`),
  description: z.string().optional().describe('清晰、简洁地描述此命令的功能，使用主动语态。'),
  run_in_background: semanticBoolean(z.boolean().optional()).describe(`设置为 true 可在后台运行此命令。稍后使用 Read 读取输出。`),
  dangerouslyDisableSandbox: semanticBoolean(z.boolean().optional()).describe('设置为 true 可危险地覆盖沙箱模式，在不使用沙箱的情况下运行命令。')
}));

// 当后台任务被禁用时，有条件地从模式中移除 run_in_background
const inputSchema = lazySchema(() => isBackgroundTasksDisabled ? fullInputSchema().omit({
  run_in_background: true
}) : fullInputSchema());
type InputSchema = ReturnType<typeof inputSchema>;

// 使用 fullInputSchema 作为类型以始终包含 run_in_background
// （即使它从模式中省略，代码也需要处理它）
export type PowerShellToolInput = z.infer<ReturnType<typeof fullInputSchema>>;
const outputSchema = lazySchema(() => z.object({
  stdout: z.string().describe('命令的标准输出'),
  stderr: z.string().describe('命令的标准错误输出'),
  interrupted: z.boolean().describe('命令是否被中断'),
  returnCodeInterpretation: z.string().optional().describe('对具有特殊含义的非错误退出码的语义解释'),
  isImage: z.boolean().optional().describe('标志，指示 stdout 是否包含图像数据'),
  persistedOutputPath: z.string().optional().describe('当输出过大无法内联时，持久化完整输出的路径'),
  persistedOutputSize: z.number().optional().describe('持久化时的总输出大小（字节）'),
  backgroundTaskId: z.string().optional().describe('如果命令在后台运行，则为后台任务的 ID'),
  backgroundedByUser: z.boolean().optional().describe('如果用户通过 Ctrl+B 手动将命令转入后台，则为 true'),
  assistantAutoBackgrounded: z.boolean().optional().describe('如果命令因超过助手模式阻塞预算而自动转入后台，则为 true')
}));
type OutputSchema = ReturnType<typeof outputSchema>;
export type Out = z.infer<OutputSchema>;
import type { PowerShellProgress } from '../../types/tools.js';
export type { PowerShellProgress } from '../../types/tools.js';
const COMMON_BACKGROUND_COMMANDS = ['npm', 'yarn', 'pnpm', 'node', 'python', 'python3', 'go', 'cargo', 'make', 'docker', 'terraform', 'webpack', 'vite', 'jest', 'pytest', 'curl', 'Invoke-WebRequest', 'build', 'test', 'serve', 'watch', 'dev'] as const;
function getCommandTypeForLogging(command: string): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0] || '';
  for (const cmd of COMMON_BACKGROUND_COMMANDS) {
    if (firstWord.toLowerCase() === cmd.toLowerCase()) {
      return cmd as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
    }
  }
  return 'other' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
}
export const PowerShellTool = buildTool({
  name: POWERSHELL_TOOL_NAME,
  searchHint: '执行 Windows PowerShell 命令',
  maxResultSizeChars: 30_000,
  strict: true,
  async description({
    description
  }: Partial<PowerShellToolInput>): Promise<string> {
    return description || '运行 PowerShell 命令';
  },
  async prompt(): Promise<string> {
    return getPrompt();
  },
  isConcurrencySafe(input: PowerShellToolInput): boolean {
    // DOGE: 防御性检查 —— input 无效时视为不安全并返回 false
    if (!input) return false
    return this.isReadOnly?.(input) ?? false;
  },
  isSearchOrReadCommand(input: Partial<PowerShellToolInput>): {
    isSearch: boolean;
    isRead: boolean;
  } {
    if (!input.command) {
      return {
        isSearch: false,
        isRead: false
      };
    }
    return isSearchOrReadPowerShellCommand(input.command);
  },
  isReadOnly(input: PowerShellToolInput): boolean {
    // DOGE: 防御性检查 —— input 或 command 无效时返回 false
    if (!input || typeof input.command !== 'string') return false
    // 在声明只读之前检查同步安全启发式规则。
    // 完整的 AST 解析是异步的，此处不可用，因此我们使用
    // 基于正则表达式的检测来识别子表达式、splatting、成员
    // 调用和赋值 — 与 BashTool 的模式一致，在评估 cmdlet 允许列表之前检查安全问题。
    if (hasSyncSecurityConcerns(input.command)) {
      return false;
    }
    // 注意：此处在没有解析后的 AST 的情况下调用 isReadOnlyCommand。没有
    // AST，isReadOnlyCommand 无法分割管道/语句，对于除最简单的单标记命令外都将返回
    // false。这是同步 Tool.isReadOnly() 接口的已知限制 — 真正的
    // 只读自动允许发生在异步的 powershellToolHasPermission 中（步骤
    // 4.5），其中可获取解析后的 AST。
    return isReadOnlyCommand(input.command);
  },
  toAutoClassifierInput(input) {
    // DOGE: 防御性检查 —— input 或 command 无效时返回空字符串
    if (!input || typeof input.command !== 'string') return ''
    return input.command;
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName(): string {
    return 'PowerShell';
  },
  getToolUseSummary(input: Partial<PowerShellToolInput> | undefined): string | null {
    if (!input?.command) {
      return null;
    }
    const {
      command,
      description
    } = input;
    if (description) {
      return description;
    }
    return truncate(command, TOOL_SUMMARY_MAX_LENGTH);
  },
  getActivityDescription(input: Partial<PowerShellToolInput> | undefined): string {
    if (!input?.command) {
      return '正在运行命令';
    }
    const desc = input.description ?? truncate(input.command, TOOL_SUMMARY_MAX_LENGTH);
    return `正在运行 ${desc}`;
  },
  isEnabled(): boolean {
    return true;
  },
  async validateInput(input: PowerShellToolInput): Promise<ValidationResult> {
    // DOGE: 防御性检查 —— input 或 command 无效时直接返回成功（放行）
    if (!input || typeof input.command !== 'string') {
      return { result: true }
    }
    // 纵深防御：也在 call() 中保护直接调用者。
    if (isWindowsSandboxPolicyViolation()) {
      return {
        result: false,
        message: WINDOWS_SANDBOX_POLICY_REFUSAL,
        errorCode: 11
      };
    }
    if (feature('MONITOR_TOOL') && !isBackgroundTasksDisabled && !input.run_in_background) {
      const sleepPattern = detectBlockedSleepPattern(input.command);
      if (sleepPattern !== null) {
        return {
          result: false,
          message: `已阻止：${sleepPattern}。请在后台运行阻塞命令，设置 run_in_background: true — 完成后你会收到完成通知。对于流式事件（监视日志、轮询 API），请使用 Monitor 工具。如果你确实需要延迟（速率限制、有意的步进），请保持在 2 秒以内。`,
          errorCode: 10
        };
      }
    }
    return {
      result: true
    };
  },
  async checkPermissions(input: PowerShellToolInput, context: Parameters<Tool['checkPermissions']>[1]): Promise<PermissionResult> {
    return await powershellToolHasPermission(input, context);
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseQueuedMessage,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  mapToolResultToToolResultBlockParam({
    interrupted,
    stdout,
    stderr,
    isImage,
    persistedOutputPath,
    persistedOutputSize,
    backgroundTaskId,
    backgroundedByUser,
    assistantAutoBackgrounded
  }: Out, toolUseID: string): ToolResultBlockParam {
    // 对于图像数据，格式化为 Claude 的图像内容块
    if (isImage) {
      const block = buildImageToolResult(stdout, toolUseID);
      if (block) return block;
    }
    let processedStdout = stdout;
    if (persistedOutputPath) {
      const trimmed = stdout ? stdout.replace(/^(\s*\n)+/, '').trimEnd() : '';
      const preview = generatePreview(trimmed, PREVIEW_SIZE_BYTES);
      processedStdout = buildLargeToolResultMessage({
        filepath: persistedOutputPath,
        originalSize: persistedOutputSize ?? 0,
        isJson: false,
        preview: preview.preview,
        hasMore: preview.hasMore
      });
    } else if (stdout) {
      processedStdout = stdout.replace(/^(\s*\n)+/, '');
      processedStdout = processedStdout.trimEnd();
    }
    let errorMessage = stderr.trim();
    if (interrupted) {
      if (stderr) errorMessage += EOL;
      errorMessage += '<error>命令在完成之前被中止</error>';
    }
    let backgroundInfo = '';
    if (backgroundTaskId) {
      const outputPath = getTaskOutputPath(backgroundTaskId);
      if (assistantAutoBackgrounded) {
        backgroundInfo = `命令超过了助手模式阻塞预算（${ASSISTANT_BLOCKING_BUDGET_MS / 1000} 秒），已移至后台，ID: ${backgroundTaskId}。它仍在运行 — 完成后你会收到通知。输出正写入: ${outputPath}。在助手模式下，将长时间运行的工作委托给子代理或使用 run_in_background 以保持此对话的响应性。`;
      } else if (backgroundedByUser) {
        backgroundInfo = `命令已被用户手动转入后台，ID: ${backgroundTaskId}。输出正写入: ${outputPath}`;
      } else {
        backgroundInfo = `命令正在后台运行，ID: ${backgroundTaskId}。输出正写入: ${outputPath}`;
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [processedStdout, errorMessage, backgroundInfo].filter(Boolean).join('\n'),
      is_error: interrupted
    };
  },
  async call(input: PowerShellToolInput, toolUseContext: Parameters<Tool['call']>[1], _canUseTool?: CanUseToolFn, _parentMessage?: AssistantMessage, onProgress?: ToolCallProgress<PowerShellProgress>): Promise<{
    data: Out;
  }> {
    // DOGE: 防御性检查 —— input 或 command 无效时直接返回失败
    if (!input || typeof input.command !== 'string') {
      return {
        type: 'tool_result' as const,
        data: {
          type: 'text' as const,
          text: 'Error: PowerShell command input is empty or invalid. Please provide a valid command.',
        },
        isError: true,
      } as unknown as { data: Out }
    }
    // 关键守卫：promptShellExecution.ts 和 processBashCommand.tsx
    // 直接调用 PowerShellTool.call()，绕过了 validateInput。这是
    // 覆盖所有调用者的检查。策略原理请参见 isWindowsSandboxPolicyViolation 注释。
    if (isWindowsSandboxPolicyViolation()) {
      throw new Error(WINDOWS_SANDBOX_POLICY_REFUSAL);
    }
    const {
      abortController,
      setAppState,
      setToolJSX
    } = toolUseContext;
    const isMainThread = !toolUseContext.agentId;
    let progressCounter = 0;
    try {
      const commandGenerator = runPowerShellCommand({
        input,
        abortController,
        // 使用始终共享的任务通道，以便异步代理的后台
        // shell 任务实际被注册（并可在代理退出时终止）。
        setAppState: toolUseContext.setAppStateForTasks ?? setAppState,
        setToolJSX,
        preventCwdChanges: !isMainThread,
        isMainThread,
        toolUseId: toolUseContext.toolUseId,
        agentId: toolUseContext.agentId
      });
      let generatorResult;
      do {
        generatorResult = await commandGenerator.next();
        if (!generatorResult.done && onProgress) {
          const progress = generatorResult.value;
          onProgress({
            toolUseID: `ps-progress-${progressCounter++}`,
            data: {
              type: 'powershell_progress',
              output: progress.output,
              fullOutput: progress.fullOutput,
              elapsedTimeSeconds: progress.elapsedTimeSeconds,
              totalLines: progress.totalLines,
              totalBytes: progress.totalBytes,
              timeoutMs: progress.timeoutMs,
              taskId: progress.taskId
            }
          });
        }
      } while (!generatorResult.done);
      const result = generatorResult.value;

      // 提供 git/PR 使用指标（与 BashTool 相同的计数器）。PS 调用
      // git/gh/glab/curl 作为外部二进制文件，语法相同，因此
      // trackGitOperations 中与 shell 无关的正则检测可照常工作。
      // 在 backgroundTaskId 提前返回之前调用，因此后台命令也会被计数（与 BashTool.tsx:912 一致）。
      //
      // 预检哨兵守卫：两个 PS 预检路径（pwsh 未找到、
      // exec 生成捕获）返回 code: 0 + 空 stdout + stderr，以便 call() 可以
      // 优雅地显示 stderr 而不是抛出 ShellError。但
      // gitOperationTracking.ts:48 将 code 0 视为成功，并会对命令进行正则匹配，
      // 错误地计数一个从未运行过的命令。
      // BashTool 是安全的 — 其预检通过 createFailedCommand 处理
      // （code: 1），因此跟踪会提前返回。遇到此哨兵时跳过跟踪。
      const isPreFlightSentinel = result.code === 0 && !result.stdout && result.stderr && !result.backgroundTaskId;
      if (!isPreFlightSentinel) {
        trackGitOperations(input.command, result.code, result.stdout);
      }

      // 区分用户驱动的中断（提交了新消息）与其他
      // 中断状态。仅用户中断应抑制 ShellError —
      // 超时终止或带 isError 的进程终止仍应抛出异常。
      // 与 BashTool 的 isInterrupt 匹配。
      const isInterrupt = result.interrupted && abortController.signal.reason === 'interrupt';

      // 仅主线程跟踪/重置 cwd；代理有其自己的 cwd
      // 隔离。与 BashTool 的 !preventCwdChanges 守卫匹配。
      // 在 backgroundTaskId 提前返回之前运行：命令可能在转入后台之前更改
      // CWD（例如 `Set-Location C:\temp;
      // Start-Sleep 60`），而 BashTool 没有这样的提前返回 — 其
      // 后台结果在 :945 处通过 resetCwdIfOutsideProject 流动。
      let stderrForShellReset = '';
      if (isMainThread) {
        const appState = toolUseContext.getAppState();
        if (resetCwdIfOutsideProject(appState.toolPermissionContext)) {
          stderrForShellReset = stdErrAppendShellResetMessage('');
        }
      }

      // 如果已转入后台，立即返回任务 ID。首先剥离提示，以便
      // 中断后台化的 fullOutput 不会将标签泄露给
      // 模型（BashTool 没有提前返回，因此所有路径都流过其
      // 单个提取点）。
      if (result.backgroundTaskId) {
        const bgExtracted = extractClaudeCodeHints(result.stdout || '', input.command);
        if (isMainThread && bgExtracted.hints.length > 0) {
          for (const hint of bgExtracted.hints) maybeRecordPluginHint(hint);
        }
        return {
          data: {
            stdout: bgExtracted.stripped,
            stderr: [result.stderr || '', stderrForShellReset].filter(Boolean).join('\n'),
            interrupted: false,
            backgroundTaskId: result.backgroundTaskId,
            backgroundedByUser: result.backgroundedByUser,
            assistantAutoBackgrounded: result.assistantAutoBackgrounded
          }
        };
      }
      const stdoutAccumulator = new EndTruncatingAccumulator();
      const processedStdout = (result.stdout || '').trimEnd();
      stdoutAccumulator.append(processedStdout + EOL);

      // 使用语义规则解释退出码。PS 原生 cmdlet（Select-String、
      // Compare-Object、Test-Path）在无匹配时退出 0，因此它们始终在此处命中默认值。
      // 这主要处理外部 .exe（grep、rg、findstr、fc、robocopy），
      // 对于它们，非零值可能表示“无匹配”/“文件已复制”而非失败。
      const interpretation = interpretCommandResult(input.command, result.code, processedStdout, result.stderr || '');

      // toolErrors.ts 中的 getErrorParts() 在构建 ShellError 消息时
      // 已从 error.code 前添加 'Exit code N'。请勿
      // 在此处将其重复添加到 stdout（BashTool 在 :939 处的追加是死代码 —
      // 它在读取 stdoutAccumulator.toString() 之前就抛出了异常）。

      let stdout = stripEmptyLines(stdoutAccumulator.toString());

      // Claude Code 提示协议：以 CLAUDECODE=1 为条件的 CLI/SDK 会向
      // stderr（此处合并到 stdout）发出 `<claude-code-hint />` 标签。扫描、
      // 记录以供 useClaudeCodeHintRecommendation 显示，然后剥离
      // 以便模型永远看不到该标签 — 零 token 的侧信道。
      // 剥离无条件运行（子代理输出也必须保持干净）；
      // 只有对话记录是主线程专属的。
      const extracted = extractClaudeCodeHints(stdout, input.command);
      stdout = extracted.stripped;
      if (isMainThread && extracted.hints.length > 0) {
        for (const hint of extracted.hints) maybeRecordPluginHint(hint);
      }

      // preSpawnError 表示 exec() 成功但内部 shell 在命令运行前失败
      // （例如 CWD 被删除）。createFailedCommand 设置 code=1，
      // interpretCommandResult 可能将其误认为 grep 无匹配 / findstr
      // 字符串未找到。直接抛出。与 BashTool.tsx:957 匹配。
      if (result.preSpawnError) {
        throw new Error(result.preSpawnError);
      }
      if (interpretation.isError && !isInterrupt) {
        throw new ShellError(stdout, result.stderr || '', result.code, result.interrupted);
      }

      // 大输出：磁盘上的文件大小超过 getMaxOutputLength() 字节。
      // stdout 已包含第一块。将输出文件复制到
      // tool-results 目录，以便模型可通过 FileRead 读取。如果 > 64 MB，
      // 则在复制后截断。与 BashTool.tsx:983-1005 匹配。
      //
      // 放置在 preSpawnError/ShellError 抛出之后（与 BashTool 的顺序匹配，
      // 其中持久化在 try/finally 之后）：一个失败的命令
      // 同时产生了 >maxOutputLength 字节的输出，否则会进行 3-4 次磁盘
      // 系统调用，存储到 tool-results/，然后抛出 — 导致文件孤立。
      const MAX_PERSISTED_SIZE = 64 * 1024 * 1024;
      let persistedOutputPath: string | undefined;
      let persistedOutputSize: number | undefined;
      if (result.outputFilePath && result.outputTaskId) {
        try {
          const fileStat = await fsStat(result.outputFilePath);
          persistedOutputSize = fileStat.size;
          await ensureToolResultsDir();
          const dest = getToolResultPath(result.outputTaskId, false);
          if (fileStat.size > MAX_PERSISTED_SIZE) {
            await fsTruncate(result.outputFilePath, MAX_PERSISTED_SIZE);
          }
          try {
            await link(result.outputFilePath, dest);
          } catch {
            await copyFile(result.outputFilePath, dest);
          }
          persistedOutputPath = dest;
        } catch {
          // 文件可能已经不存在 — stdout 预览足够
        }
      }

      // 如果存在图像，则限制尺寸和大小（CC-304 — 参见
      // resizeShellImageOutput）。限定解码缓冲区的范围，以便在构建输出对象之前
      // 可以被回收。
      let isImage = isImageOutput(stdout);
      let compressedStdout = stdout;
      if (isImage) {
        const resized = await resizeShellImageOutput(stdout, result.outputFilePath, persistedOutputSize);
        if (resized) {
          compressedStdout = resized;
        } else {
          // 解析失败（例如数据 URL 后有跨行 stdout）。保持
          // isImage 与实际发送内容同步，以便 UI 标签保持
          // 准确 — mapToolResultToToolResultBlockParam 的防御性回退
          // 将发送文本，而非图像块。
          isImage = false;
        }
      }
      const finalStderr = [result.stderr || '', stderrForShellReset].filter(Boolean).join('\n');
      logEvent('tengu_powershell_tool_command_executed', {
        command_type: getCommandTypeForLogging(input.command),
        stdout_length: compressedStdout.length,
        stderr_length: finalStderr.length,
        exit_code: result.code,
        interrupted: result.interrupted
      });
      return {
        data: {
          stdout: compressedStdout,
          stderr: finalStderr,
          interrupted: result.interrupted,
          returnCodeInterpretation: interpretation.message,
          isImage,
          persistedOutputPath,
          persistedOutputSize
        }
      };
    } finally {
      if (setToolJSX) setToolJSX(null);
    }
  },
  isResultTruncated(output: Out): boolean {
    return isOutputLineTruncated(output.stdout) || isOutputLineTruncated(output.stderr);
  }
} satisfies ToolDef<InputSchema, Out>);
async function* runPowerShellCommand({
  input,
  abortController,
  setAppState,
  setToolJSX,
  preventCwdChanges,
  isMainThread,
  toolUseId,
  agentId
}: {
  input: PowerShellToolInput;
  abortController: AbortController;
  setAppState: (f: (prev: AppState) => AppState) => void;
  setToolJSX?: SetToolJSXFn;
  preventCwdChanges?: boolean;
  isMainThread?: boolean;
  toolUseId?: string;
  agentId?: AgentId;
}): AsyncGenerator<{
  type: 'progress';
  output: string;
  fullOutput: string;
  elapsedTimeSeconds: number;
  totalLines: number;
  totalBytes: number;
  taskId?: string;
  timeoutMs?: number;
}, ExecResult, void> {
  const {
    command,
    description,
    timeout,
    run_in_background,
    dangerouslyDisableSandbox
  } = input;
  const timeoutMs = Math.min(timeout || getDefaultTimeoutMs(), getMaxTimeoutMs());
  let fullOutput = '';
  let lastProgressOutput = '';
  let lastTotalLines = 0;
  let lastTotalBytes = 0;
  let backgroundShellId: string | undefined = undefined;
  let interruptBackgroundingStarted = false;
  let assistantAutoBackgrounded = false;

  // 进度信号：当 backgroundShellId 在异步
  // .then() 路径中设置时解析，立即唤醒生成器的 Promise.race，而不是
  // 等待下一个 setTimeout 滴答（与 BashTool 模式匹配）。
  let resolveProgress: (() => void) | null = null;
  function createProgressSignal(): Promise<null> {
    return new Promise<null>(resolve => {
      resolveProgress = () => resolve(null);
    });
  }
  const shouldAutoBackground = !isBackgroundTasksDisabled && isAutobackgroundingAllowed(command);
  const powershellPath = await getCachedPowerShellPath();
  if (!powershellPath) {
    // 预检失败：pwsh 未安装。返回 code 0 以便 call() 将此作为
    // 优雅的 stderr 消息显示，而不是抛出 ShellError — 命令从未运行，
    // 因此没有有意义的非零退出码可报告。
    return {
      stdout: '',
      stderr: '此系统上 PowerShell 不可用。',
      code: 0,
      interrupted: false
    };
  }
  let shellCommand: Awaited<ReturnType<typeof exec>>;
  try {
    shellCommand = await exec(command, abortController.signal, 'powershell', {
      timeout: timeoutMs,
      onProgress(lastLines, allLines, totalLines, totalBytes, isIncomplete) {
        lastProgressOutput = lastLines;
        fullOutput = allLines;
        lastTotalLines = totalLines;
        lastTotalBytes = isIncomplete ? totalBytes : 0;
      },
      preventCwdChanges,
      // 沙箱在 Linux/macOS/WSL2 上可用 — 那里的 pwsh 是原生二进制文件，
      // SandboxManager.wrapWithSandbox 像对 bash 一样包装它（Shell.ts 使用
      // /bin/sh 作为外部 spawn 以解析 POSIX 引用的 bwrap/sandbox-exec
      // 字符串）。在 Windows 原生环境下，沙箱不支持；shouldUseSandbox()
      // 通过 isSandboxingEnabled() → isSupportedPlatform() → false 返回 false。
      // 显式平台检查是多余但明显的。
      shouldUseSandbox: getPlatform() === 'windows' ? false : shouldUseSandbox({
        command,
        dangerouslyDisableSandbox
      }),
      shouldAutoBackground
    });
  } catch (e) {
    logError(e);
    // 预检失败：spawn/exec 在命令运行前被拒绝。使用
    // code 0 以便 call() 优雅地返回 stderr，而不是抛出 ShellError。
    return {
      stdout: '',
      stderr: `执行 PowerShell 命令失败: ${getErrorMessage(e)}`,
      code: 0,
      interrupted: false
    };
  }
  const resultPromise = shellCommand.result;

  // 辅助函数：生成后台任务并返回其 ID
  async function spawnBackgroundTask(): Promise<string> {
    const handle = await spawnShellTask({
      command,
      description: description || command,
      shellCommand,
      toolUseId,
      agentId
    }, {
      abortController,
      getAppState: () => {
        throw new Error('在 runPowerShellCommand 上下文中 getAppState 不可用');
      },
      setAppState
    });
    return handle.taskId;
  }

  // 辅助函数：开始后台化并记录日志
  function startBackgrounding(eventName: string, backgroundFn?: (shellId: string) => void): void {
    // 如果前台任务已注册（通过进度循环中的 registerForeground），
    // 则就地将其转为后台，而不是重新生成。重新生成
    // 会覆盖 tasks[taskId]，发出重复的 task_started SDK 事件，
    // 并泄漏第一个清理回调。
    if (foregroundTaskId) {
      if (!backgroundExistingForegroundTask(foregroundTaskId, shellCommand, description || command, setAppState, toolUseId)) {
        return;
      }
      backgroundShellId = foregroundTaskId;
      logEvent(eventName, {
        command_type: getCommandTypeForLogging(command)
      });
      backgroundFn?.(foregroundTaskId);
      return;
    }

    // 无前台任务注册 — 生成新的后台任务
    // 注意：尽管是异步的，spawn 本质上是同步的
    void spawnBackgroundTask().then(shellId => {
      backgroundShellId = shellId;

      // 唤醒生成器的 Promise.race，使其看到 backgroundShellId。
      // 否则，生成器会等待当前 setTimeout 触发
      // （最多约 1 秒）才注意到后台化。与 BashTool 匹配。
      const resolve = resolveProgress;
      if (resolve) {
        resolveProgress = null;
        resolve();
      }
      logEvent(eventName, {
        command_type: getCommandTypeForLogging(command)
      });
      if (backgroundFn) {
        backgroundFn(shellId);
      }
    });
  }

  // 如果启用，设置在超时时自动后台化
  if (shellCommand.onTimeout && shouldAutoBackground) {
    shellCommand.onTimeout(backgroundFn => {
      startBackgrounding('tengu_powershell_command_timeout_backgrounded', backgroundFn);
    });
  }

  // 在助手模式下，主代理应保持响应。在 ASSISTANT_BLOCKING_BUDGET_MS 后自动将阻塞命令转入后台，
  // 以便代理可以继续协调而不是等待。命令继续运行 — 无状态丢失。
  if (feature('KAIROS') && getKairosActive() && isMainThread && !isBackgroundTasksDisabled && run_in_background !== true) {
    setTimeout(() => {
      if (shellCommand.status === 'running' && backgroundShellId === undefined) {
        assistantAutoBackgrounded = true;
        startBackgrounding('tengu_powershell_command_assistant_auto_backgrounded');
      }
    }, ASSISTANT_BLOCKING_BUDGET_MS).unref();
  }

  // 处理 Claude 明确要求将其在后台运行的情况
  // 当通过 run_in_background 明确请求时，无论命令类型如何，始终尊重请求
  // （isAutobackgroundingAllowed 仅适用于自动后台化）
  if (run_in_background === true && !isBackgroundTasksDisabled) {
    const shellId = await spawnBackgroundTask();
    logEvent('tengu_powershell_command_explicitly_backgrounded', {
      command_type: getCommandTypeForLogging(command)
    });
    return {
      stdout: '',
      stderr: '',
      code: 0,
      interrupted: false,
      backgroundTaskId: shellId
    };
  }

  // 开始轮询输出文件以获取进度
  TaskOutput.startPolling(shellCommand.taskOutput.taskId);

  // 设置进度生成，带周期性检查
  const startTime = Date.now();
  let nextProgressTime = startTime + PROGRESS_THRESHOLD_MS;
  let foregroundTaskId: string | undefined = undefined;

  // 进度循环：包裹在 try/finally 中，以便在每个退出路径上都调用 stopPolling
  // — 正常完成、超时/中断后台化、以及 Ctrl+B
  // （与 BashTool 模式匹配；参见 PR #18887 审查中第 :560 行的讨论）
  try {
    while (true) {
      const now = Date.now();
      const timeUntilNextProgress = Math.max(0, nextProgressTime - now);
      const progressSignal = createProgressSignal();
      const result = await Promise.race([resultPromise, new Promise<null>(resolve => setTimeout(r => r(null), timeUntilNextProgress, resolve).unref()), progressSignal]);
      if (result !== null) {
        // 竞态：后台化触发（15 秒定时器 / onTimeout / Ctrl+B）但
        // 命令在下一个轮询滴答前完成。#handleExit 设置
        // backgroundTaskId 但跳过 outputFilePath（它假设后台
        // 消息或 <task_notification> 将携带路径）。剥离
        // backgroundTaskId 以便模型看到一个干净完成的命令，
        // 为大输出重建 outputFilePath，并抑制
        // 来自 .then() 处理程序的冗余 <task_notification>。
        // 检查 result.backgroundTaskId（而非闭包变量）以同样覆盖
        // 直接调用 shellCommand.background() 的 Ctrl+B。
        if (result.backgroundTaskId !== undefined) {
          markTaskNotified(result.backgroundTaskId, setAppState);
          const fixedResult: ExecResult = {
            ...result,
            backgroundTaskId: undefined
          };
          // 镜像 ShellCommand.#handleExit 中被跳过的大输出分支，
          // 因为 #backgroundTaskId 已设置。
          const {
            taskOutput
          } = shellCommand;
          if (taskOutput.stdoutToFile && !taskOutput.outputFileRedundant) {
            fixedResult.outputFilePath = taskOutput.path;
            fixedResult.outputFileSize = taskOutput.outputFileSize;
            fixedResult.outputTaskId = taskOutput.taskId;
          }
          // 命令已完成 — 在此清理流监听器。finally
          // 块的守卫 (!backgroundShellId && status !== 'backgrounded')
          // 正确跳过了对 *正在运行* 的后台任务的清理，但
          // 在此竞态中，进程已结束。与 BashTool.tsx:1399 匹配。
          shellCommand.cleanup();
          return fixedResult;
        }
        // 命令已完成
        return result;
      }

      // 检查命令是否已转入后台（通过超时或中断）
      if (backgroundShellId) {
        return {
          stdout: interruptBackgroundingStarted ? fullOutput : '',
          stderr: '',
          code: 0,
          interrupted: false,
          backgroundTaskId: backgroundShellId,
          assistantAutoBackgrounded
        };
      }

      // 用户提交了新消息 — 转入后台而不是终止
      if (abortController.signal.aborted && abortController.signal.reason === 'interrupt' && !interruptBackgroundingStarted) {
        interruptBackgroundingStarted = true;
        if (!isBackgroundTasksDisabled) {
          startBackgrounding('tengu_powershell_command_interrupt_backgrounded');
          // 重新循环，以便上面的 backgroundShellId 检查能捕获同步的
          // foregroundTaskId→background 路径。否则，我们会落到
          // 下面的 Ctrl+B 检查，它匹配 status==='backgrounded'
          // 并错误地返回 backgroundedByUser:true。（缺陷 020/021）
          continue;
        }
        shellCommand.kill();
      }

      // 检查此前台任务是否通过 backgroundAll()（ctrl+b）转入后台
      if (foregroundTaskId) {
        if (shellCommand.status === 'backgrounded') {
          return {
            stdout: '',
            stderr: '',
            code: 0,
            interrupted: false,
            backgroundTaskId: foregroundTaskId,
            backgroundedByUser: true
          };
        }
      }

      // 到了进度更新的时间
      const elapsed = Date.now() - startTime;
      const elapsedSeconds = Math.floor(elapsed / 1000);

      // 在阈值后显示后台化 UI 提示
      if (!isBackgroundTasksDisabled && backgroundShellId === undefined && elapsedSeconds >= PROGRESS_THRESHOLD_MS / 1000 && setToolJSX) {
        if (!foregroundTaskId) {
          foregroundTaskId = registerForeground({
            command,
            description: description || command,
            shellCommand,
            agentId
          }, setAppState, toolUseId);
        }
        setToolJSX({
          jsx: <BackgroundHint />,
          shouldHidePromptInput: false,
          shouldContinueAnimation: true,
          showSpinner: true
        });
      }
      yield {
        type: 'progress',
        fullOutput,
        output: lastProgressOutput,
        elapsedTimeSeconds: elapsedSeconds,
        totalLines: lastTotalLines,
        totalBytes: lastTotalBytes,
        taskId: shellCommand.taskOutput.taskId,
        ...(timeout ? {
          timeoutMs
        } : undefined)
      };
      nextProgressTime = Date.now() + PROGRESS_INTERVAL_MS;
    }
  } finally {
    TaskOutput.stopPolling(shellCommand.taskOutput.taskId);
    // 确保在每条退出路径（成功、拒绝、中止）上都运行清理。
    // 当转入后台时跳过 — LocalShellTask 负责这些清理。
    // 与主 #21105 匹配。
    if (!backgroundShellId && shellCommand.status !== 'backgrounded') {
      if (foregroundTaskId) {
        unregisterForeground(foregroundTaskId, setAppState);
      }
      shellCommand.cleanup();
    }
  }
}