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
import { notifyVscodeFileUpdated } from '../../services/mcp/vscodeSdkMcp.js';
import type { SetToolJSXFn, ToolCallProgress, ToolUseContext, ValidationResult } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { backgroundExistingForegroundTask, markTaskNotified, registerForeground, spawnShellTask, unregisterForeground } from '../../tasks/LocalShellTask/LocalShellTask.js';
import type { AgentId } from '../../types/ids.js';
import type { AssistantMessage } from '../../types/message.js';
import { parseForSecurity } from '../../utils/bash/ast.js';
import { splitCommand_DEPRECATED, splitCommandWithOperators } from '../../utils/bash/commands.js';
import { extractClaudeCodeHints } from '../../utils/claudeCodeHints.js';
import { detectCodeIndexingFromCommand } from '../../utils/codeIndexing.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { isENOENT, ShellError } from '../../utils/errors.js';
import { detectFileEncoding, detectLineEndings, getFileModificationTime, writeTextContent } from '../../utils/file.js';
import { fileHistoryEnabled, fileHistoryTrackEdit } from '../../utils/fileHistory.js';
import { truncate } from '../../utils/format.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { expandPath } from '../../utils/path.js';
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js';
import { maybeRecordPluginHint } from '../../utils/plugins/hintRecommendation.js';
import { exec } from '../../utils/Shell.js';
import type { ExecResult } from '../../utils/ShellCommand.js';
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js';
import { semanticBoolean } from '../../utils/semanticBoolean.js';
import { semanticNumber } from '../../utils/semanticNumber.js';
import { EndTruncatingAccumulator } from '../../utils/stringUtils.js';
import { getTaskOutputPath } from '../../utils/task/diskOutput.js';
import { TaskOutput } from '../../utils/task/TaskOutput.js';
import { isOutputLineTruncated } from '../../utils/terminal.js';
import { buildLargeToolResultMessage, ensureToolResultsDir, generatePreview, getToolResultPath, PREVIEW_SIZE_BYTES } from '../../utils/toolResultStorage.js';
import { userFacingName as fileEditUserFacingName } from '../FileEditTool/UI.js';
import { trackGitOperations } from '../shared/gitOperationTracking.js';
import { bashToolHasPermission, commandHasAnyCd, matchWildcardPattern, permissionRuleExtractPrefix } from './bashPermissions.js';
import { interpretCommandResult } from './commandSemantics.js';
import { getDefaultTimeoutMs, getMaxTimeoutMs, getSimplePrompt } from './prompt.js';
import { checkReadOnlyConstraints } from './readOnlyValidation.js';
import { parseSedEditCommand } from './sedEditParser.js';
import { shouldUseSandbox } from './shouldUseSandbox.js';
import { BASH_TOOL_NAME } from './toolName.js';
import { BackgroundHint, renderToolResultMessage, renderToolUseErrorMessage, renderToolUseMessage, renderToolUseProgressMessage, renderToolUseQueuedMessage } from './UI.js';
import { buildImageToolResult, isImageOutput, resetCwdIfOutsideProject, resizeShellImageOutput, stdErrAppendShellResetMessage, stripEmptyLines } from './utils.js';
const EOL = '\n';

// 进度显示常量
const PROGRESS_THRESHOLD_MS = 2000; // 2秒后显示进度
// 在助手模式下，阻塞型 Bash 命令在主代理中超过此毫秒数后将自动转入后台
const ASSISTANT_BLOCKING_BUDGET_MS = 15_000;

// 可折叠显示的搜索命令（grep、find 等）
const BASH_SEARCH_COMMANDS = new Set(['find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis']);

// 可折叠显示的读取/查看命令（cat、head 等）
const BASH_READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'more',
// 分析命令
'wc', 'stat', 'file', 'strings',
// 数据处理命令 —— 常用于在管道中解析/转换文件内容
'jq', 'awk', 'cut', 'sort', 'uniq', 'tr']);

// 可折叠显示的目录列表命令（ls、tree、du）。
// 从 BASH_READ_COMMANDS 中拆分出来，以便摘要显示“列出了 N 个目录”而非误导性的“读取了 N 个文件”。
const BASH_LIST_COMMANDS = new Set(['ls', 'tree', 'du']);

// 在任何位置都语义中性的命令 —— 纯输出/状态命令，不会改变整体管道的读取/搜索性质。
// 例如 `ls dir && echo "---" && ls dir2` 仍然是只读复合命令。
const BASH_SEMANTIC_NEUTRAL_COMMANDS = new Set(['echo', 'printf', 'true', 'false', ':' // bash 无操作
]);

// 成功时通常不产生标准输出的命令
const BASH_SILENT_COMMANDS = new Set(['mv', 'cp', 'rm', 'mkdir', 'rmdir', 'chmod', 'chown', 'chgrp', 'touch', 'ln', 'cd', 'export', 'unset', 'wait']);

// 在文件顶部（例如 const EOL = '\n'; 之后）添加以下函数

/**
 * 将常见的 Windows cmd 命令转换为 bash 兼容命令
 * 解决模型在 Git Bash 环境下错误生成 Windows 风格命令的问题
 * 
 * 支持的转换：
 * - dir [路径] [/s] [/b] [/w]  → ls [选项] [路径]
 * - copy 源 目标               → cp 源 目标
 * - del/erase 文件            → rm 文件
 * - move 源 目标               → mv 源 目标
 * - type 文件                 → cat 文件
 * - findstr 模式 文件          → grep 模式 文件
 * - fc 文件1 文件2             → diff 文件1 文件2
 * 
 * 注意：保留重定向、管道、后台符号等，只替换第一个命令单词及其参数风格。
 */
/**
 * 将常见的 Windows cmd 命令转换为 bash 兼容命令
 * 支持：dir, copy, del, type, move, findstr, fc, cls, cd.. 等
 */
function normalizeWindowsCommand(cmd: string): string {
    let trimmed = cmd.trim();
    if (!trimmed) return cmd;

    // ------ 1. 处理 dir 命令（支持 /s, /b, /w, /d 及其组合）------
    // 匹配 dir [路径] [选项...]
    // 选项可能包含 /s, /b, /w, /d, /p 等，顺序任意。
    const dirMatch = trimmed.match(/^\bdir\b(?:\s+(?:([^\/\s][^\s|&;]*)?)\s*)?((?:\/(?:[sbwd]|a-d|a-d-s|a-d-s-h))+\b)?/i);
    if (dirMatch) {
        let path = dirMatch[1] || '.';
        let options = dirMatch[2] || '';
        const hasRecursive = /\/s/i.test(options);
        const hasBare = /\/b/i.test(options);
        // 构建 ls 参数
        let lsArgs = '';
        if (hasRecursive) lsArgs += ' -R';
        if (hasBare) {
            // /b 表示 bare format (just names) -> ls -1 (每行一个)
            lsArgs += ' -1';
        } else {
            // 默认类似 dir 的列式输出
            lsArgs += ' -C';
        }
        // 如果还有 /w (宽格式) -> ls -C (默认已是宽格式)
        // 如果还有 /d (按列排序) -> ls -C 也近似
        // 简单处理：统一使用 ls -C -R 或 ls -1 -R
        return `ls ${lsArgs.trim()} ${path}`.trim();
    }

    // ------ 2. 命令名映射表 ------
    const commandMap: { [key: string]: string } = {
        'copy': 'cp',
        'del': 'rm',
        'erase': 'rm',
        'move': 'mv',
        'type': 'cat',
        'findstr': 'grep',
        'fc': 'diff',
        'cls': 'clear',
        'cd..': 'cd ..',
        'cd\\': 'cd /',
    };

    // 提取第一个单词（命令名）
    const firstWordMatch = trimmed.match(/^(\w+)(?:\s|$)/);
    if (firstWordMatch) {
        const firstWord = firstWordMatch[1].toLowerCase();
        if (commandMap[firstWord]) {
            const newCmd = commandMap[firstWord];
            // 替换命令名，保持其余部分
            let rest = trimmed.slice(firstWord.length).trimStart();
            // 特殊处理：del 和 erase 通常不需要确认，rm 直接删除
            return `${newCmd} ${rest}`;
        }
    }

    // 处理环境变量 %VAR% -> $VAR
    trimmed = trimmed.replace(/%([^%]+)%/g, '$$$1');
    return trimmed;
}

/**
 * 检查 Bash 命令是否为搜索或读取操作。
 * 用于决定命令是否应在 UI 中折叠显示。
 * 返回一个对象，指示是否为搜索或读取操作。
 *
 * 对于管道（例如 `cat file | bq`），所有部分都必须是搜索/读取命令，
 * 整个命令才被视为可折叠。
 *
 * 语义中性的命令（echo、printf、true、false、:）在任何位置都会被跳过，
 * 因为它们是纯输出/状态命令，不影响管道的读取/搜索性质（例如 `ls dir && echo "---" && ls dir2` 仍然是读取）。
 */
export function isSearchOrReadBashCommand(command: string): {
  isSearch: boolean;
  isRead: boolean;
  isList: boolean;
} {
  let partsWithOperators: string[];
  try {
    partsWithOperators = splitCommandWithOperators(command);
  } catch {
    // 如果由于语法错误无法解析命令，则不是搜索/读取命令
    return {
      isSearch: false,
      isRead: false,
      isList: false
    };
  }
  if (partsWithOperators.length === 0) {
    return {
      isSearch: false,
      isRead: false,
      isList: false
    };
  }
  let hasSearch = false;
  let hasRead = false;
  let hasList = false;
  let hasNonNeutralCommand = false;
  let skipNextAsRedirectTarget = false;
  for (const part of partsWithOperators) {
    if (skipNextAsRedirectTarget) {
      skipNextAsRedirectTarget = false;
      continue;
    }
    if (part === '>' || part === '>>' || part === '>&') {
      skipNextAsRedirectTarget = true;
      continue;
    }
    if (part === '||' || part === '&&' || part === '|' || part === ';') {
      continue;
    }
    const baseCommand = part.trim().split(/\s+/)[0];
    if (!baseCommand) {
      continue;
    }
    if (BASH_SEMANTIC_NEUTRAL_COMMANDS.has(baseCommand)) {
      continue;
    }
    hasNonNeutralCommand = true;
    const isPartSearch = BASH_SEARCH_COMMANDS.has(baseCommand);
    const isPartRead = BASH_READ_COMMANDS.has(baseCommand);
    const isPartList = BASH_LIST_COMMANDS.has(baseCommand);
    if (!isPartSearch && !isPartRead && !isPartList) {
      return {
        isSearch: false,
        isRead: false,
        isList: false
      };
    }
    if (isPartSearch) hasSearch = true;
    if (isPartRead) hasRead = true;
    if (isPartList) hasList = true;
  }

  // 仅有中性命令（例如单独的 "echo foo"）——不可折叠
  if (!hasNonNeutralCommand) {
    return {
      isSearch: false,
      isRead: false,
      isList: false
    };
  }
  return {
    isSearch: hasSearch,
    isRead: hasRead,
    isList: hasList
  };
}

/**
 * 检查 Bash 命令是否在成功时不产生标准输出。
 * 用于在 UI 中显示“完成”而非“（无输出）”。
 */
function isSilentBashCommand(command: string): boolean {
  let partsWithOperators: string[];
  try {
    partsWithOperators = splitCommandWithOperators(command);
  } catch {
    return false;
  }
  if (partsWithOperators.length === 0) {
    return false;
  }
  let hasNonFallbackCommand = false;
  let lastOperator: string | null = null;
  let skipNextAsRedirectTarget = false;
  for (const part of partsWithOperators) {
    if (skipNextAsRedirectTarget) {
      skipNextAsRedirectTarget = false;
      continue;
    }
    if (part === '>' || part === '>>' || part === '>&') {
      skipNextAsRedirectTarget = true;
      continue;
    }
    if (part === '||' || part === '&&' || part === '|' || part === ';') {
      lastOperator = part;
      continue;
    }
    const baseCommand = part.trim().split(/\s+/)[0];
    if (!baseCommand) {
      continue;
    }
    if (lastOperator === '||' && BASH_SEMANTIC_NEUTRAL_COMMANDS.has(baseCommand)) {
      continue;
    }
    hasNonFallbackCommand = true;
    if (!BASH_SILENT_COMMANDS.has(baseCommand)) {
      return false;
    }
  }
  return hasNonFallbackCommand;
}

// 不应自动转入后台的命令
const DISALLOWED_AUTO_BACKGROUND_COMMANDS = ['sleep' // sleep 应在前台运行，除非用户明确要求后台
];

// 模块加载时检查后台任务是否被禁用
const isBackgroundTasksDisabled =
  // eslint-disable-next-line custom-rules/no-process-env-top-level -- 有意为之：schema 必须在模块加载时定义
  isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS);
const fullInputSchema = lazySchema(() => z.strictObject({
  command: z.string().describe('要执行的命令'),
  timeout: semanticNumber(z.number().optional()).describe(`可选的超时时间（毫秒），最大 ${getMaxTimeoutMs()}`),
  description: z.string().optional().describe(`对此命令作用的清晰、简洁的描述，使用主动语态。绝不要在描述中使用“复杂”或“风险”等词——只需描述其功能。

对于简单命令（git、npm、标准 CLI 工具），保持简洁（5-10 个词）：
- ls → "列出当前目录中的文件"
- git status → "显示工作树状态"
- npm install → "安装包依赖"

对于不易一眼看懂的复杂命令（管道命令、生僻标志等），添加足够的上下文以阐明其作用：
- find . -name "*.tmp" -exec rm {} \\; → "查找并删除所有 .tmp 文件"
- git reset --hard origin/main → "丢弃所有本地更改并与远程 main 分支保持一致"
- curl -s url | jq '.data[]' → "从 URL 获取 JSON 并提取 data 数组元素"`),
  run_in_background: semanticBoolean(z.boolean().optional()).describe(`设置为 true 可使此命令在后台运行。稍后使用 Read 工具读取输出。`),
  dangerouslyDisableSandbox: semanticBoolean(z.boolean().optional()).describe('设置为 true 可危险地覆盖沙箱模式并在无沙箱环境下运行命令。'),
  _simulatedSedEdit: z.object({
    filePath: z.string(),
    newContent: z.string()
  }).optional().describe('内部字段：预览中预先计算好的 sed 编辑结果')
}));

// 始终从面向模型的 schema 中移除 _simulatedSedEdit。这是一个仅限内部的字段，
// 在用户批准 sed 编辑预览后由 SedEditPermissionRequest 设置。
// 将其暴露给模型会让模型能够通过将无害命令与任意文件写入配对来绕过权限检查和沙箱。
// 另外，当后台任务被禁用时，有条件地移除 run_in_background。
const inputSchema = lazySchema(() => isBackgroundTasksDisabled ? fullInputSchema().omit({
  run_in_background: true,
  _simulatedSedEdit: true
}) : fullInputSchema().omit({
  _simulatedSedEdit: true
}));
type InputSchema = ReturnType<typeof inputSchema>;

// 使用 fullInputSchema 作为类型定义，以始终包含 run_in_background
// （即使它被从 schema 中移除，代码仍需处理它）
export type BashToolInput = z.infer<ReturnType<typeof fullInputSchema>>;
const COMMON_BACKGROUND_COMMANDS = ['npm', 'yarn', 'pnpm', 'node', 'python', 'python3', 'go', 'cargo', 'make', 'docker', 'terraform', 'webpack', 'vite', 'jest', 'pytest', 'curl', 'wget', 'build', 'test', 'serve', 'watch', 'dev'] as const;
function getCommandTypeForLogging(command: string): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  const parts = splitCommand_DEPRECATED(command);
  if (parts.length === 0) return 'other' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;

  // 检查命令的每个部分是否匹配常见的后台命令
  for (const part of parts) {
    const baseCommand = part.split(' ')[0] || '';
    if (COMMON_BACKGROUND_COMMANDS.includes(baseCommand as (typeof COMMON_BACKGROUND_COMMANDS)[number])) {
      return baseCommand as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
    }
  }
  return 'other' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
}
const outputSchema = lazySchema(() => z.object({
  stdout: z.string().describe('命令的标准输出'),
  stderr: z.string().describe('命令的标准错误输出'),
  rawOutputPath: z.string().optional().describe('用于大型 MCP 工具输出的原始输出文件路径'),
  interrupted: z.boolean().describe('命令是否被中断'),
  isImage: z.boolean().optional().describe('标志，指示标准输出是否包含图像数据'),
  backgroundTaskId: z.string().optional().describe('如果命令在后台运行，则为后台任务的 ID'),
  backgroundedByUser: z.boolean().optional().describe('如果用户使用 Ctrl+B 手动将命令转入后台，则为 true'),
  assistantAutoBackgrounded: z.boolean().optional().describe('如果助手模式因长时间阻塞而自动将命令转入后台，则为 true'),
  dangerouslyDisableSandbox: z.boolean().optional().describe('标志，指示是否覆盖了沙箱模式'),
  returnCodeInterpretation: z.string().optional().describe('对具有特殊含义的非错误退出码的语义解释'),
  noOutputExpected: z.boolean().optional().describe('该命令是否预期成功时不产生输出'),
  structuredContent: z.array(z.any()).optional().describe('结构化内容块'),
  persistedOutputPath: z.string().optional().describe('当输出过大无法内联时，持久化到 tool-results 目录的完整输出路径'),
  persistedOutputSize: z.number().optional().describe('输出内容的总字节大小（当输出过大无法内联时设置）')
}));
type OutputSchema = ReturnType<typeof outputSchema>;
export type Out = z.infer<OutputSchema>;

// 重新导出 BashProgress 以打破循环导入
export type { BashProgress } from '../../types/tools.js';
import type { BashProgress } from '../../types/tools.js';

/**
 * 检查命令是否允许被自动转入后台
 * @param command 要检查的命令
 * @returns 对于不应自动后台的命令（如 sleep）返回 false
 */
function isAutobackgroundingAllowed(command: string): boolean {
  const parts = splitCommand_DEPRECATED(command);
  if (parts.length === 0) return true;

  // 获取第一部分，应为基本命令
  const baseCommand = parts[0]?.trim();
  if (!baseCommand) return true;
  return !DISALLOWED_AUTO_BACKGROUND_COMMANDS.includes(baseCommand);
}

/**
 * 检测独立的或位于前导位置的 `sleep N` 模式，应改用 Monitor 工具。
 * 捕获 `sleep 5`、`sleep 5 && check`、`sleep 5; check` —— 但不捕获管道、子 shell 或脚本中的 sleep（这些可以）。
 */
export function detectBlockedSleepPattern(command: string): string | null {
  const parts = splitCommand_DEPRECATED(command);
  if (parts.length === 0) return null;
  const first = parts[0]?.trim() ?? '';
  // 裸的 `sleep N` 或 `sleep N.N` 作为第一个子命令。
  // 浮点时长（sleep 0.5）是允许的——那是合理的节奏控制，不是轮询。
  const m = /^sleep\s+(\d+)\s*$/.exec(first);
  if (!m) return null;
  const secs = parseInt(m[1]!, 10);
  if (secs < 2) return null; // 2秒内的 sleep 没问题（限流、节奏控制）

  // `sleep N` 单独出现 → “你在等什么？”
  // `sleep N && check` → “使用 Monitor { command: check }”
  const rest = parts.slice(1).join(' ').trim();
  return rest ? `sleep ${secs} 后跟: ${rest}` : `独立的 sleep ${secs}`;
}

/**
 * 检查命令是否包含不应在沙箱中运行的工具
 * 这包括：
 * - 基于动态配置的禁用命令和子串 (tengu_sandbox_disabled_commands)
 * - 来自 settings.json 的用户配置命令 (sandbox.excludedCommands)
 *
 * 用户配置的命令支持与权限规则相同的模式语法：
 * - 精确匹配："npm run lint"
 * - 前缀模式："npm run test:*"
 */

type SimulatedSedEditResult = {
  data: Out;
};
type SimulatedSedEditContext = Pick<ToolUseContext, 'readFileState' | 'updateFileHistoryState'>;

/**
 * 直接应用模拟的 sed 编辑，而不是运行 sed。
 * 权限对话框使用此功能以确保用户预览的内容就是实际写入文件的内容。
 */
async function applySedEdit(simulatedEdit: {
  filePath: string;
  newContent: string;
}, toolUseContext: SimulatedSedEditContext, parentMessage?: AssistantMessage): Promise<SimulatedSedEditResult> {
  const {
    filePath,
    newContent
  } = simulatedEdit;
  const absoluteFilePath = expandPath(filePath);
  const fs = getFsImplementation();

  // 读取原始内容用于 VS Code 通知
  const encoding = detectFileEncoding(absoluteFilePath);
  let originalContent: string;
  try {
    originalContent = await fs.readFile(absoluteFilePath, {
      encoding
    });
  } catch (e) {
    if (isENOENT(e)) {
      return {
        data: {
          stdout: '',
          stderr: `sed: ${filePath}: 没有此文件或目录\n退出码 1`,
          interrupted: false
        }
      };
    }
    throw e;
  }

  // 在做出更改前追踪文件历史（用于撤销支持）
  if (fileHistoryEnabled() && parentMessage) {
    await fileHistoryTrackEdit(toolUseContext.updateFileHistoryState, absoluteFilePath, parentMessage.uuid);
  }

  // 检测行尾符并写入新内容
  const endings = detectLineEndings(absoluteFilePath);
  writeTextContent(absoluteFilePath, newContent, encoding, endings);

  // 通知 VS Code 文件变更
  notifyVscodeFileUpdated(absoluteFilePath, originalContent, newContent);

  // 更新读取时间戳以使过时写入失效
  toolUseContext.readFileState.set(absoluteFilePath, {
    content: newContent,
    timestamp: getFileModificationTime(absoluteFilePath),
    offset: undefined,
    limit: undefined
  });

  // 返回与 sed 输出格式匹配的成功结果（sed 成功时不产生输出）
  return {
    data: {
      stdout: '',
      stderr: '',
      interrupted: false
    }
  };
}
export const BashTool = buildTool({
  name: BASH_TOOL_NAME,
  searchHint: '执行 Shell 命令',
  // 30K 字符 —— 工具结果持久化阈值
  maxResultSizeChars: 30_000,
  strict: true,
  async description({
    description
  }) {
    return description || '运行 Shell 命令';
  },
  async prompt() {
    return getSimplePrompt();
  },
  isConcurrencySafe(input) {
    return this.isReadOnly?.(input) ?? false;
  },
  isReadOnly(input) {
    const compoundCommandHasCd = commandHasAnyCd(input.command);
    const result = checkReadOnlyConstraints(input, compoundCommandHasCd);
    return result.behavior === 'allow';
  },
  toAutoClassifierInput(input) {
    return input.command;
  },
  async preparePermissionMatcher({
    command
  }) {
    // Hook 的 `if` 过滤是“无匹配 → 跳过 hook”（类似拒绝语义），因此
    // 如果任何子命令匹配，复合命令必须触发 hook。若不拆分，`ls && git push` 会绕过 `Bash(git *)` 安全钩子。
    const parsed = await parseForSecurity(command);
    if (parsed.kind !== 'simple') {
      // 解析不可用 / 过于复杂：保守地运行 hook。
      return () => true;
    }
    // 基于 argv 匹配（剥离前导 VAR=val），以便 `FOO=bar git push` 仍能匹配 `Bash(git *)`。
    const subcommands = parsed.commands.map(c => c.argv.join(' '));
    return pattern => {
      const prefix = permissionRuleExtractPrefix(pattern);
      return subcommands.some(cmd => {
        if (prefix !== null) {
          return cmd === prefix || cmd.startsWith(`${prefix} `);
        }
        return matchWildcardPattern(pattern, cmd);
      });
    };
  },
  isSearchOrReadCommand(input) {
    const parsed = inputSchema().safeParse(input);
    if (!parsed.success) return {
      isSearch: false,
      isRead: false,
      isList: false
    };
    return isSearchOrReadBashCommand(parsed.data.command);
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName(input) {
    if (!input) {
      return 'Bash';
    }
    // 将 sed 原地编辑渲染为文件编辑
    if (input.command) {
      const sedInfo = parseSedEditCommand(input.command);
      if (sedInfo) {
        return fileEditUserFacingName({
          file_path: sedInfo.filePath,
          old_string: 'x'
        });
      }
    }
    // 环境变量优先：shouldUseSandbox → splitCommand_DEPRECATED → shell-quote 每次调用时的 `new RegExp`。
    // userFacingName 会在历史记录中每条 bash 消息渲染时运行；对于 ~50 条消息加一个解析缓慢的命令，
    // 这会超过渲染滴答时间 → 转换中止 → 无限重试 (#21605)。
    return isEnvTruthy(process.env.CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR) && shouldUseSandbox(input) ? 'SandboxedBash' : 'Bash';
  },
  getToolUseSummary(input) {
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
  getActivityDescription(input) {
    if (!input?.command) {
      return '正在运行命令';
    }
    const desc = input.description ?? truncate(input.command, TOOL_SUMMARY_MAX_LENGTH);
    return `正在运行 ${desc}`;
  },
  async validateInput(input: BashToolInput): Promise<ValidationResult> {
    if (feature('MONITOR_TOOL') && !isBackgroundTasksDisabled && !input.run_in_background) {
      const sleepPattern = detectBlockedSleepPattern(input.command);
      if (sleepPattern !== null) {
        return {
          result: false,
          message: `已阻止: ${sleepPattern}。请使用 run_in_background: true 在后台运行阻塞命令——完成后您将收到完成通知。对于流式事件（如监视日志、轮询 API），请使用 Monitor 工具。如果您确实需要延迟（限流、刻意的节奏控制），请将延迟控制在 2 秒以内。`,
          errorCode: 10
        };
      }
    }
    return {
      result: true
    };
  },
  async checkPermissions(input, context): Promise<PermissionResult> {
    return bashToolHasPermission(input, context);
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseQueuedMessage,
  renderToolResultMessage,
  // BashToolResultMessage 显示 <OutputLine content={stdout}> 加上 stderr。
  // UI 从不显示 persistedOutputPath 包装、backgroundInfo —— 这些都是面向模型的（见下方的 mapToolResult...）。
  extractSearchText({
    stdout,
    stderr
  }) {
    return stderr ? `${stdout}\n${stderr}` : stdout;
  },
  mapToolResultToToolResultBlockParam({
    interrupted,
    stdout,
    stderr,
    isImage,
    backgroundTaskId,
    backgroundedByUser,
    assistantAutoBackgrounded,
    structuredContent,
    persistedOutputPath,
    persistedOutputSize
  }, toolUseID): ToolResultBlockParam {
    // 处理结构化内容
    if (structuredContent && structuredContent.length > 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: structuredContent
      };
    }

    // 对于图像数据，为 Claude 格式化为图像内容块
    if (isImage) {
      const block = buildImageToolResult(stdout, toolUseID);
      if (block) return block;
    }
    let processedStdout = stdout;
    if (stdout) {
      // 移除前导换行或仅含空白符的行
      processedStdout = stdout.replace(/^(\s*\n)+/, '');
      // 依旧修剪末尾空白
      processedStdout = processedStdout.trimEnd();
    }

    // 对于已持久化到磁盘的大输出，为模型构建 <persisted-output> 消息。
    // UI 看不到此内容 —— 它使用的是 data.stdout。
    if (persistedOutputPath) {
      const preview = generatePreview(processedStdout, PREVIEW_SIZE_BYTES);
      processedStdout = buildLargeToolResultMessage({
        filepath: persistedOutputPath,
        originalSize: persistedOutputSize ?? 0,
        isJson: false,
        preview: preview.preview,
        hasMore: preview.hasMore
      });
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
        backgroundInfo = `命令超出了助手模式的阻塞时间预算（${ASSISTANT_BLOCKING_BUDGET_MS / 1000} 秒），已移至后台运行，ID: ${backgroundTaskId}。它仍在运行 —— 完成后您将收到通知。输出正在写入: ${outputPath}。在助手模式下，请将长时间运行的工作委托给子代理，或使用 run_in_background 以保持此对话的响应性。`;
      } else if (backgroundedByUser) {
        backgroundInfo = `命令已被用户手动转入后台，ID: ${backgroundTaskId}。输出正在写入: ${outputPath}`;
      } else {
        backgroundInfo = `命令正在后台运行，ID: ${backgroundTaskId}。输出正在写入: ${outputPath}`;
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [processedStdout, errorMessage, backgroundInfo].filter(Boolean).join('\n'),
      is_error: interrupted
    };
  },
  async call(input: BashToolInput, toolUseContext, _canUseTool?: CanUseToolFn, parentMessage?: AssistantMessage, onProgress?: ToolCallProgress<BashProgress>) {
    // 处理模拟的 sed 编辑 —— 直接应用而不是运行 sed
    // 这确保用户预览的内容就是实际写入的内容
    if (input._simulatedSedEdit) {
      return applySedEdit(input._simulatedSedEdit, toolUseContext, parentMessage);
    }
    const {
      abortController,
      getAppState,
      setAppState,
      setToolJSX
    } = toolUseContext;
    const stdoutAccumulator = new EndTruncatingAccumulator();
    let stderrForShellReset = '';
    let interpretationResult: ReturnType<typeof interpretCommandResult> | undefined;
    let progressCounter = 0;
    let wasInterrupted = false;
    let result: ExecResult;
    const isMainThread = !toolUseContext.agentId;
    const preventCwdChanges = !isMainThread;
    try {
      // 使用 runShellCommand 的新异步生成器版本
      const commandGenerator = runShellCommand({
        input,
        abortController,
        // 使用始终共享的任务通道，以便异步代理的后台 bash 任务也能被正确注册（并在代理退出时可被终止）。
        setAppState: toolUseContext.setAppStateForTasks ?? setAppState,
        setToolJSX,
        preventCwdChanges,
        isMainThread,
        toolUseId: toolUseContext.toolUseId,
        agentId: toolUseContext.agentId
      });

      // 消费生成器并捕获返回值
      let generatorResult;
      do {
        generatorResult = await commandGenerator.next();
        if (!generatorResult.done && onProgress) {
          const progress = generatorResult.value;
          onProgress({
            toolUseID: `bash-progress-${progressCounter++}`,
            data: {
              type: 'bash_progress',
              output: progress.output,
              fullOutput: progress.fullOutput,
              elapsedTimeSeconds: progress.elapsedTimeSeconds,
              totalLines: progress.totalLines,
              totalBytes: progress.totalBytes,
              taskId: progress.taskId,
              timeoutMs: progress.timeoutMs
            }
          });
        }
      } while (!generatorResult.done);

      // 从生成器的返回值中获取最终结果
      result = generatorResult.value;
      trackGitOperations(input.command, result.code, result.stdout);
      const isInterrupt = result.interrupted && abortController.signal.reason === 'interrupt';

      // stderr 已合并到 stdout（合并的文件描述符）—— result.stdout 包含两者
      stdoutAccumulator.append((result.stdout || '').trimEnd() + EOL);

      // 使用语义规则解释命令结果
      interpretationResult = interpretCommandResult(input.command, result.code, result.stdout || '', '');

      // 检查 git index.lock 错误（stderr 现在在 stdout 中）
      if (result.stdout && result.stdout.includes(".git/index.lock': File exists")) {
        logEvent('tengu_git_index_lock_error', {});
      }
      if (interpretationResult.isError && !isInterrupt) {
        // 仅在确实为错误时添加退出码
        if (result.code !== 0) {
          stdoutAccumulator.append(`退出码 ${result.code}`);
        }
      }
      if (!preventCwdChanges) {
        const appState = getAppState();
        if (resetCwdIfOutsideProject(appState.toolPermissionContext)) {
          stderrForShellReset = stdErrAppendShellResetMessage('');
        }
      }

      // 如果有沙箱违规，为输出添加注释（stderr 在 stdout 中）
      const outputWithSbFailures = SandboxManager.annotateStderrWithSandboxFailures(input.command, result.stdout || '');
      if (result.preSpawnError) {
        throw new Error(result.preSpawnError);
      }
      if (interpretationResult.isError && !isInterrupt) {
        // stderr 已合并到 stdout（合并的文件描述符）；outputWithSbFailures 已包含完整输出。
        // 传递 '' 作为 stdout 以避免在 getErrorParts() 和 processBashCommand 中重复。
        throw new ShellError('', outputWithSbFailures, result.code, result.interrupted);
      }
      wasInterrupted = result.interrupted;
    } finally {
      if (setToolJSX) setToolJSX(null);
    }

    // 从累加器获取最终字符串
    const stdout = stdoutAccumulator.toString();

    // 大输出：磁盘文件大小超过 getMaxOutputLength() 字节。
    // stdout 已包含第一块内容（来自 getStdout()）。将输出文件复制到 tool-results 目录，
    // 以便模型可通过 FileRead 读取。若 > 64 MB，则复制后截断。
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
        // 文件可能已消失 —— stdout 预览已足够
      }
    }
    const commandType = input.command.split(' ')[0];
    logEvent('tengu_bash_tool_command_executed', {
      command_type: commandType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      stdout_length: stdout.length,
      stderr_length: 0,
      exit_code: result.code,
      interrupted: wasInterrupted
    });

    // 记录代码索引工具的使用情况
    const codeIndexingTool = detectCodeIndexingFromCommand(input.command);
    if (codeIndexingTool) {
      logEvent('tengu_code_indexing_tool_used', {
        tool: codeIndexingTool as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        source: 'cli' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: result.code === 0
      });
    }
    let strippedStdout = stripEmptyLines(stdout);

    // Claude Code 提示协议：CLI/SDK 在 CLAUDECODE=1 时通过 stderr（此处合并到 stdout）发出
    // `<claude-code-hint />` 标签。扫描、记录以供 useClaudeCodeHintRecommendation 显示，
    // 然后剥离，使模型永不可见——零 token 侧信道。
    // 剥离操作无条件运行（子代理输出也必须保持干净）；只有对话记录是主线程专属的。
    const extracted = extractClaudeCodeHints(strippedStdout, input.command);
    strippedStdout = extracted.stripped;
    if (isMainThread && extracted.hints.length > 0) {
      for (const hint of extracted.hints) maybeRecordPluginHint(hint);
    }
    let isImage = isImageOutput(strippedStdout);

    // 如果有图片，限制图片尺寸和大小（CC-304 —— 见 resizeShellImageOutput）。
    // 在构建输出 Out 对象前释放解码后的缓冲区，以便回收内存。
    let compressedStdout = strippedStdout;
    if (isImage) {
      const resized = await resizeShellImageOutput(strippedStdout, result.outputFilePath, persistedOutputSize);
      if (resized) {
        compressedStdout = resized;
      } else {
        // 解析失败或文件过大（例如超过 MAX_IMAGE_FILE_SIZE）。
        // 保持 isImage 与实际发送内容同步，以便 UI 标签准确反映 —— mapToolResultToToolResultBlockParam
        // 的防御性回退将发送文本，而非图像块。
        isImage = false;
      }
    }
    const data: Out = {
      stdout: compressedStdout,
      stderr: stderrForShellReset,
      interrupted: wasInterrupted,
      isImage,
      returnCodeInterpretation: interpretationResult?.message,
      noOutputExpected: isSilentBashCommand(input.command),
      backgroundTaskId: result.backgroundTaskId,
      backgroundedByUser: result.backgroundedByUser,
      assistantAutoBackgrounded: result.assistantAutoBackgrounded,
      dangerouslyDisableSandbox: 'dangerouslyDisableSandbox' in input ? input.dangerouslyDisableSandbox as boolean | undefined : undefined,
      persistedOutputPath,
      persistedOutputSize
    };
    return {
      data
    };
  },
  renderToolUseErrorMessage,
  isResultTruncated(output: Out): boolean {
    return isOutputLineTruncated(output.stdout) || isOutputLineTruncated(output.stderr);
  }
} satisfies ToolDef<InputSchema, Out, BashProgress>);
async function* runShellCommand({
  input,
  abortController,
  setAppState,
  setToolJSX,
  preventCwdChanges,
  isMainThread,
  toolUseId,
  agentId
}: {
  input: BashToolInput;
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
  totalBytes?: number;
  taskId?: string;
  timeoutMs?: number;
}, ExecResult, void> {
  let {
    command,
    description,
    timeout,
    run_in_background
  } = input;
  // 规范化 Windows 命令
  const originalCommand = command;
  command = normalizeWindowsCommand(command);
  if (originalCommand !== command) {
    console.debug(`[BashTool] 命令归一化: "${originalCommand}" → "${command}"`);
  }

  const timeoutMs = timeout || getDefaultTimeoutMs();
  let fullOutput = '';
  let lastProgressOutput = '';
  let lastTotalLines = 0;
  let lastTotalBytes = 0;
  let backgroundShellId: string | undefined = undefined;
  let assistantAutoBackgrounded = false;

  // 进度信号
  let resolveProgress: (() => void) | null = null;
  function createProgressSignal(): Promise<null> {
    return new Promise<null>(resolve => {
      resolveProgress = () => resolve(null);
    });
  }

  // 提前声明 foregroundTaskId，确保 startBackgrounding 中可访问
  let foregroundTaskId: string | undefined = undefined;

  // 确定是否应启用自动后台
  const shouldAutoBackground = !isBackgroundTasksDisabled && isAutobackgroundingAllowed(command);
  const shellCommand = await exec(command, abortController.signal, 'bash', {
    timeout: timeoutMs,
    onProgress(lastLines, allLines, totalLines, totalBytes, isIncomplete) {
      lastProgressOutput = lastLines;
      fullOutput = allLines;
      lastTotalLines = totalLines;
      lastTotalBytes = isIncomplete ? totalBytes : 0;
      const resolve = resolveProgress;
      if (resolve) {
        resolveProgress = null;
        resolve();
      }
    },
    preventCwdChanges,
    shouldUseSandbox: shouldUseSandbox(input),
    shouldAutoBackground
  });

  // 启动命令执行
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
        // 此处没有直接访问 getAppState 的途径，但 spawn 过程中实际上并未使用它
        throw new Error('getAppState 在 runShellCommand 上下文中不可用');
      },
      setAppState
    });
    return handle.taskId;
  }

  // 辅助函数：开始后台处理，可选日志记录
  function startBackgrounding(eventName: string, backgroundFn?: (shellId: string) => void): void {
    // 如果前台任务已注册（通过进度循环中的 registerForeground），则就地转入后台而非重新生成。
    // 重新生成会覆盖 tasks[taskId]，发出重复的 task_started SDK 事件，并泄漏第一个清理回调。
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

    // 无前台任务注册 —— 生成新的后台任务
    // 注意：spawn 尽管是异步的，但实际上是同步的
    void spawnBackgroundTask().then(shellId => {
      backgroundShellId = shellId;

      // 唤醒生成器的 Promise.race，使其能看到 backgroundShellId。
      // 否则，如果轮询器已停止对此任务进行计时（无输出 + 与兄弟 stopPolling 调用的共享轮询器竞争），
      // 且进程在 I/O 上挂起，第 ~1357 行的 race 将永远不会解析，导致生成器尽管已转入后台仍会死锁。
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

  // 如果启用，设置超时自动后台
  // 仅对允许自动后台的命令启用（非 sleep 等）
  if (shellCommand.onTimeout && shouldAutoBackground) {
    shellCommand.onTimeout(backgroundFn => {
      startBackgrounding('tengu_bash_command_timeout_backgrounded', backgroundFn);
    });
  }

  // 在助手模式下，主代理应保持响应性。阻塞命令在 ASSISTANT_BLOCKING_BUDGET_MS 后自动转入后台，
  // 以便代理继续协调而非等待。命令继续运行——无状态丢失。
  if (feature('KAIROS') && getKairosActive() && isMainThread && !isBackgroundTasksDisabled && run_in_background !== true) {
    setTimeout(() => {
      if (shellCommand.status === 'running' && backgroundShellId === undefined) {
        assistantAutoBackgrounded = true;
        startBackgrounding('tengu_bash_command_assistant_auto_backgrounded');
      }
    }, ASSISTANT_BLOCKING_BUDGET_MS).unref();
  }

  // 处理 Claude 明确要求后台运行的情况
  // 当通过 run_in_background 显式请求时，无论命令类型如何，始终尊重请求
  // （isAutobackgroundingAllowed 仅适用于自动后台情况）
  // 如果后台任务被禁用，则在前台运行
  if (run_in_background === true && !isBackgroundTasksDisabled) {
    const shellId = await spawnBackgroundTask();
    logEvent('tengu_bash_command_explicitly_backgrounded', {
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

  // 等待初始阈值后再显示进度
  const startTime = Date.now();
  //let foregroundTaskId: string | undefined = undefined;
  {
    const initialResult = await Promise.race([resultPromise, new Promise<null>(resolve => {
      const t = setTimeout((r: (v: null) => void) => r(null), PROGRESS_THRESHOLD_MS, resolve);
      t.unref();
    })]);
    if (initialResult !== null) {
      shellCommand.cleanup();
      return initialResult;
    }
    if (backgroundShellId) {
      return {
        stdout: '',
        stderr: '',
        code: 0,
        interrupted: false,
        backgroundTaskId: backgroundShellId,
        assistantAutoBackgrounded
      };
    }
  }

  // 开始轮询输出文件以获取进度。轮询器的 #tick 每秒调用 onProgress，进而解析下方的 progressSignal。
  TaskOutput.startPolling(shellCommand.taskOutput.taskId);

  // 进度循环：唤醒由共享轮询器调用 onProgress 驱动，后者解析 progressSignal。
  try {
    while (true) {
      const progressSignal = createProgressSignal();
      const result = await Promise.race([resultPromise, progressSignal]);
      if (result !== null) {
        // 竞争：后台处理已触发（15 秒定时器 / onTimeout / Ctrl+B），但命令在下一次轮询滴答前已完成。
        // #handleExit 设置了 backgroundTaskId 但跳过了 outputFilePath（它假定后台消息或 <task_notification> 将携带路径）。
        // 剥离 backgroundTaskId 使模型看到一个干净的已完成命令，为大输出重构 outputFilePath，
        // 并抑制来自 .then() 处理器的冗余 <task_notification>。
        // 检查 result.backgroundTaskId（而非闭包变量）以同时覆盖直接调用 shellCommand.background() 的 Ctrl+B 情况。
        if (result.backgroundTaskId !== undefined) {
          markTaskNotified(result.backgroundTaskId, setAppState);
          const fixedResult: ExecResult = {
            ...result,
            backgroundTaskId: undefined
          };
          // 镜像 ShellCommand.#handleExit 中因 #backgroundTaskId 被设置而跳过的大输出分支。
          const {
            taskOutput
          } = shellCommand;
          if (taskOutput.stdoutToFile && !taskOutput.outputFileRedundant) {
            fixedResult.outputFilePath = taskOutput.path;
            fixedResult.outputFileSize = taskOutput.outputFileSize;
            fixedResult.outputTaskId = taskOutput.taskId;
          }
          shellCommand.cleanup();
          return fixedResult;
        }
        // 命令已完成 —— 返回实际结果
        // 如果已注册为前台任务，则注销之
        if (foregroundTaskId) {
          unregisterForeground(foregroundTaskId, setAppState);
        }
        // 清理前台命令的流资源（后台命令由 LocalShellTask 清理）
        shellCommand.cleanup();
        return result;
      }

      // 检查命令是否已转入后台（无论是旧机制还是新的 backgroundAll）
      if (backgroundShellId) {
        return {
          stdout: '',
          stderr: '',
          code: 0,
          interrupted: false,
          backgroundTaskId: backgroundShellId,
          assistantAutoBackgrounded
        };
      }

      // 检查此前台任务是否已通过 backgroundAll() 转入后台
      if (foregroundTaskId) {
        // 当 background() 被调用时，shellCommand.status 变为 'backgrounded'
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

      // 是时候进行进度更新了
      const elapsed = Date.now() - startTime;
      const elapsedSeconds = Math.floor(elapsed / 1000);

      // 如果可用，显示最小的后台处理 UI
      // 如果后台任务被禁用，则跳过
      if (!isBackgroundTasksDisabled && backgroundShellId === undefined && elapsedSeconds >= PROGRESS_THRESHOLD_MS / 1000 && setToolJSX) {
        // 将此命令注册为前台任务，以便可通过 Ctrl+B 转入后台
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
    }
  } finally {
    TaskOutput.stopPolling(shellCommand.taskOutput.taskId);
  }
}