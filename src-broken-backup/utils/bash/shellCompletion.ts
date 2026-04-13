import type { SuggestionItem } from '../../../../components/PromptInput/PromptInputFooterSuggestions.js'
import {
  type ParseEntry,
  quote,
  tryParseShellCommand,
} from '../bash/shellQuote.js'
import { logForDebugging } from '../debug.js'
import { getShellType } from '../localInstaller.js'
import * as Shell from '../Shell.js'

// 常量
const MAX_SHELL_COMPLETIONS = 15
const SHELL_COMPLETION_TIMEOUT_MS = 1000
const COMMAND_OPERATORS = ['|', '||', '&&', ';'] as const

export type ShellCompletionType = 'command' | 'variable' | 'file'

type InputContext = {
  prefix: string
  completionType: ShellCompletionType
}

/**
 * 检查解析后的标记是否为命令运算符（|, ||, &&, ;。
 */
function isCommandOperator(token: ParseEntry): boolean {
  return (
    typeof token === 'object' &&
    token !== null &&
    'op' in token &&
    (COMMAND_OPERATORS as readonly string[]).includes(token.op as string)
  )
}

/**
 * 仅根据前缀特征确定补全类型
 */
function getCompletionTypeFromPrefix(prefix: string): ShellCompletionType {
  if (prefix.startsWith('$')) {
    return 'variable'
  }
  if (
    prefix.includes('/') ||
    prefix.startsWith('~') ||
    prefix.startsWith('.')
  ) {
    return 'file'
  }
  return 'command'
}

/**
 * 在解析后的标记中查找最后一个字符串标记及其索引
 */
function findLastStringToken(
  tokens: ParseEntry[],
): { token: string; index: number } | null {
  const i = tokens.findLastIndex(t => typeof t === 'string')
  return i !== -1 ? { token: tokens[i] as string, index: i } : null
}

/**
 * 检查我们是否处于需要新命令的上下文。
 * （在输入开头或命令运算符之后）
 */
function isNewCommandContext(
  tokens: ParseEntry[],
  currentTokenIndex: number,
): boolean {
  if (currentTokenIndex === 0) {
    return true
  }
  const prevToken = tokens[currentTokenIndex - 1]
  return prevToken !== undefined && isCommandOperator(prevToken)
}

/**
 * 解析输入以提取补全上下文
 */
function parseInputContext(input: string, cursorOffset: number): InputContext {
  const beforeCursor = input.slice(0, cursorOffset)

  // 检查是否为变量前缀，在使用 shell-quote 扩展之前
  const varMatch = beforeCursor.match(/\$[a-zA-Z_][a-zA-Z0-9_]*$/)
  if (varMatch) {
    return { prefix: varMatch[0], completionType: 'variable' }
  }

  // 使用 shell-quote 解析
  const parseResult = tryParseShellCommand(beforeCursor)
  if (!parseResult.success) {
    // 回退到简单解。
    const tokens = beforeCursor.split(/\s+/)
    const prefix = tokens[tokens.length - 1] || ''
    const isFirstToken = tokens.length === 1 && !beforeCursor.includes(' ')
    const completionType = isFirstToken
      ? 'command'
      : getCompletionTypeFromPrefix(prefix)
    return { prefix, completionType }
  }

  // 提取当前标记
  const lastToken = findLastStringToken(parseResult.tokens)
  if (!lastToken) {
    // 未找到字符串标记 - 检查是否在运算符之。
    const lastParsedToken = parseResult.tokens[parseResult.tokens.length - 1]
    const completionType =
      lastParsedToken && isCommandOperator(lastParsedToken)
        ? 'command'
        : 'command' // 默认在开头为命令
    return { prefix: '', completionType }
  }

  // 如果有尾随空格，用户正在开始新的参。
  if (beforeCursor.endsWith(' ')) {
    // 第一个标记（命令）后跟空）= 预期为文件参。
    return { prefix: '', completionType: 'file' }
  }

  // 根据上下文确定补全类。
  const baseType = getCompletionTypeFromPrefix(lastToken.token)

  // 如果根据前缀明确是文件或变量，使用该类型
  if (baseType === 'variable' || baseType === 'file') {
    return { prefix: lastToken.token, completionType: baseType }
  }

  // 对于类似命令的标记，检查上下文：我们是否正在启动新命令。
  const completionType = isNewCommandContext(
    parseResult.tokens,
    lastToken.index,
  )
    ? 'command'
    : 'file' // 不在运算符之）= 文件参数

  return { prefix: lastToken.token, completionType }
}

/**
 * 使用 compgen 生成 bash 补全命令
 */
function getBashCompletionCommand(
  prefix: string,
  completionType: ShellCompletionType,
): string {
  if (completionType === 'variable') {
    // 变量补全 - 移除 $ 前缀
    const varName = prefix.slice(1)
    return `compgen -v ${quote([varName])} 2>/dev/null`
  } else if (completionType === 'file') {
    // 文件补全，目录后跟斜杠，文件后跟空格
    // 使用 'while read' 防止包含换行符的文件名导致命令注。
    return `compgen -f ${quote([prefix])} 2>/dev/null | head -${MAX_SHELL_COMPLETIONS} | while IFS= read -r f; do [ -d "$f" ] && echo "$f/" || echo "$f "; done`
  } else {
    // 命令补全
    return `compgen -c ${quote([prefix])} 2>/dev/null`
  }
}

/**
 * 使用原生 zsh 命令生成 zsh 补全命令
 */
function getZshCompletionCommand(
  prefix: string,
  completionType: ShellCompletionType,
): string {
  if (completionType === 'variable') {
    // 变量补全 - 使用 zsh 模式匹配进行安全过滤
    const varName = prefix.slice(1)
    return `print -rl -- \${(k)parameters[(I)${quote([varName])}*]} 2>/dev/null`
  } else if (completionType === 'file') {
    // 文件补全，目录后跟斜杠，文件后跟空格
    // 注意：zsh 全局展开不受命令注入影响（与 bash for-in 循环不同。
    return `for f in ${quote([prefix])}*(N[1,${MAX_SHELL_COMPLETIONS}]); do [[ -d "$f" ]] && echo "$f/" || echo "$f "; done`
  } else {
    // 命令补全 - 使用 zsh 模式匹配进行安全过滤
    return `print -rl -- \${(k)commands[(I)${quote([prefix])}*]} 2>/dev/null`
  }
}

/**
 * 获取给定 shell 类型的补。
 */
async function getCompletionsForShell(
  shellType: 'bash' | 'zsh',
  prefix: string,
  completionType: ShellCompletionType,
  abortSignal: AbortSignal,
): Promise<SuggestionItem[]> {
  let command: string

  if (shellType === 'bash') {
    command = getBashCompletionCommand(prefix, completionType)
  } else if (shellType === 'zsh') {
    command = getZshCompletionCommand(prefix, completionType)
  } else {
    // 不支持的 shell 类型
    return []
  }

  const shellCommand = await Shell.exec(command, abortSignal, 'bash', {
    timeout: SHELL_COMPLETION_TIMEOUT_MS,
  })
  const result = await shellCommand.result
  return result.stdout
    .split('\n')
    .filter((line: string) => line.trim())
    .slice(0, MAX_SHELL_COMPLETIONS)
    .map((text: string) => ({
      id: text,
      displayText: text,
      description: undefined,
      metadata: { completionType },
    }))
}

/**
 * 获取给定输入）shell 补全
 * 支持 bash ）zsh shell（与 Shell.ts 执行支持匹配。
 */
export async function getShellCompletions(
  input: string,
  cursorOffset: number,
  abortSignal: AbortSignal,
): Promise<SuggestionItem[]> {
  const shellType = getShellType()

  // 仅支）bash/zsh（与 Shell.ts 执行支持匹配。
  if (shellType !== 'bash' && shellType !== 'zsh') {
    return []
  }

  try {
    const { prefix, completionType } = parseInputContext(input, cursorOffset)

    if (!prefix) {
      return []
    }

    const completions = await getCompletionsForShell(
      shellType,
      prefix,
      completionType,
      abortSignal,
    )

    // 向所有建议添）inputSnapshot，以便检测输入何时更。
    return completions.map(suggestion => ({
      ...suggestion,
      metadata: {
        ...(suggestion.metadata as { completionType: ShellCompletionType }),
        inputSnapshot: input,
      },
    }))
  } catch (error) {
    logForDebugging(`Shell completion failed: ${error}`)
    return [] // 静默失败
  }
}
