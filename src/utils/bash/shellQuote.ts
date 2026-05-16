/**
 * shell-quote 库函数的安全包装，优雅地处理错误
 * 这些是原始函数的直接替代品
 */

import {
  type ParseEntry,
  parse as shellQuoteParse,
  quote as shellQuoteQuote,
} from 'shell-quote'
import { logError } from '../log.js'
import { jsonStringify } from '../slowOperations.js'

export type { ParseEntry } from 'shell-quote'

export type ShellParseResult =
  | { success: true; tokens: ParseEntry[] }
  | { success: false; error: string }

export type ShellQuoteResult =
  | { success: true; quoted: string }
  | { success: false; error: string }

export function tryParseShellCommand(
  cmd: string,
  env?:
    | Record<string, string | undefined>
    | ((key: string) => string | undefined),
): ShellParseResult {
  try {
    const tokens =
      typeof env === 'function'
        ? shellQuoteParse(cmd, env)
        : shellQuoteParse(cmd, env)
    return { success: true, tokens }
  } catch (error) {
    if (error instanceof Error) {
      logError(error)
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知解析错误',
    }
  }
}

export function tryQuoteShellArgs(args: unknown[]): ShellQuoteResult {
  try {
    const validated: string[] = args.map((arg, index) => {
      if (arg === null || arg === undefined) {
        return String(arg)
      }

      const type = typeof arg

      if (type === 'string') {
        return arg as string
      }
      if (type === 'number' || type === 'boolean') {
        return String(arg)
      }

      if (type === 'object') {
        throw new Error(
          `无法引用索引 ${index} 的参数：不支持对象值`,
        )
      }
      if (type === 'symbol') {
        throw new Error(
          `无法引用索引 ${index} 的参数：不支持符号值`,
        )
      }
      if (type === 'function') {
        throw new Error(
          `无法引用索引 ${index} 的参数：不支持函数值`,
        )
      }

      throw new Error(
        `无法引用索引 ${index} 的参数：不支持的类型 ${type}`,
      )
    })

    const quoted = shellQuoteQuote(validated)
    return { success: true, quoted }
  } catch (error) {
    if (error instanceof Error) {
      logError(error)
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知引号错误',
    }
  }
}

/**
 * 检查解析后的令牌是否包含格式错误的条目，这表明 shell-quote
 * 误解了命令。当输入包含模糊模式（如带分号的类 JSON 字符串）时，
 * shell-quote 会根据 shell 规则进行解析，产生令牌碎片，就会发生这种情况。
 *
 * 例如，`echo {"hi":"hi;evil"}` 中的 `;` 被解析为运算符，
 * 产生像 `{hi:"hi`（不平衡的花括号）这样的令牌。合法的命令
 * 会产生完整、平衡的令牌。
 *
 * 还会检测原始命令中未终止的引号：shell-quote
 * 会静默丢弃不匹配的 `"` 或 `'`，并将其余部分解析为未引用的，
 * 在令牌中不留痕迹。`echo "hi;evil | cat`（一个不匹配的 `"`）
 * 是一个 bash 语法错误，但 shell-quote 会生成干净的令牌，其中 `;` 作为
 * 运算符。下面的令牌级检查无法捕捉这一点，所以我们遍历
 * 原始命令，使用 bash 引号语义并标记奇数引号对。
 *
 * 安全：这可以防止通过 HackerOne #3482049 的 shell-quote 对模糊输入的
 * 正确解析可能被利用的命令注入。
 */
export function hasMalformedTokens(
  command: string,
  parsed: ParseEntry[],
): boolean {
  // 检查原始命令中未终止的引号。shell-quote 会静默丢弃
  // 不匹配的引号，在令牌中不留任何痕迹，所以这必须
  // 检查原始字符串。按 bash 语义遍历：反斜杠在单引号外转义
  // 下一个字符；单引号内无转义。
  let inSingle = false
  let inDouble = false
  let doubleCount = 0
  let singleCount = 0
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (c === '\\' && !inSingle) {
      i++
      continue
    }
    if (c === '"' && !inSingle) {
      doubleCount++
      inDouble = !inDouble
    } else if (c === "'" && !inDouble) {
      singleCount++
      inSingle = !inSingle
    }
  }
  if (doubleCount % 2 !== 0 || singleCount % 2 !== 0) return true

  for (const entry of parsed) {
    if (typeof entry !== 'string') continue

    // 检查不平衡的花括号
    const openBraces = (entry.match(/{/g) || []).length
    const closeBraces = (entry.match(/}/g) || []).length
    if (openBraces !== closeBraces) return true

    // 检查不平衡的圆括号
    const openParens = (entry.match(/\(/g) || []).length
    const closeParens = (entry.match(/\)/g) || []).length
    if (openParens !== closeParens) return true

    // 检查不平衡的方括号
    const openBrackets = (entry.match(/\[/g) || []).length
    const closeBrackets = (entry.match(/\]/g) || []).length
    if (openBrackets !== closeBrackets) return true

    // 检查不平衡的双引号
    // 统计未被转义的引号（前面没有反斜杠）
    // 含奇数个未转义引号的令牌是格式错误的
    // eslint-disable-next-line custom-rules/no-lookbehind-regex -- 由调用方的 hasCommandSeparator 检查保护，在短个别令牌字符串上运行
    const doubleQuotes = entry.match(/(?<!\\)"/g) || []
    if (doubleQuotes.length % 2 !== 0) return true

    // 检查不平衡的单引号
    // eslint-disable-next-line custom-rules/no-lookbehind-regex -- 同上
    const singleQuotes = entry.match(/(?<!\\)'/g) || []
    if (singleQuotes.length % 2 !== 0) return true
  }
  return false
}

/**
 * 检测包含 '\' 模式的命令，该模式利用了 shell-quote 库
 * 在单引号内错误处理反斜杠的 bug。
 *
 * 在 bash 中，单引号保留所有字符的字面值——反斜杠没有
 * 特殊含义。所以 '\' 就是字符串 \（引号打开，包含 \，
 * 然后下一个 ' 关闭它）。但 shell-quote 错误地将 \ 视为转义
 * 字符，导致 '\' 无法关闭引用的字符串。
 *
 * 这意味着 '\' <负载> '\' 模式会将 <负载> 从安全检查中隐藏
 * 因为 shell-quote 认为它们完全是一个单引号字符串。
 */
export function hasShellQuoteSingleQuoteBug(command: string): boolean {
  // 按照正确的 bash 单引号语义遍历命令
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    // 处理单引号外的反斜杠转义
    if (char === '\\' && !inSingleQuote) {
      // 跳过下一个字符（它被转义了）
      i++
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote

      // 检查是否刚关闭了一个单引号且内容以尾部反斜杠结尾
      // shell-quote 的分割器正则 '((\'|[^'])*?)' 错误地将 ' 视为单引号内的转义序列
      // 而 bash 将反斜杠视为字面值。这导致差异：shell-quote 合并了 bash 视为分离的令牌
      //
      // 奇数个尾部 \ = 始终是 bug：
      //   '' -> shell-quote: ' = 字面 '，仍打开。bash: \, 关闭。
      //   'abc' -> shell-quote: abc 然后 ' = 字面 '，仍打开。bash: abc\, 关闭。
      //   '\'  -> shell-quote: \ + '，仍打开。bash: \\, 关闭。
      //
      // 偶数个尾部 \ = 仅当命令中后续有 ' 时才为 bug：
      //   '\' 单独 -> shell-quote 回溯，两个解析器都认为字符串关闭。正确。
      //   '\' 'next' -> shell-quote: ' 消耗了关闭的 '，找到下一个 ' 作为
      //                   假关闭，合并令牌。bash: 两个独立的令牌。
      //
      // 细节：正则替换尝试 ' 在 [^'] 之前。对于 '\'，它匹配
      // 第一个 \ 通过 [^']（下一个字符是 \，不是 '），然后第二个 \ 通过 '
      // （下一个字符确实是 '）。这消耗了关闭的 '。正则继续读取
      // 直到找到另一个 ' 来关闭匹配。如果不存在，它会回溯
      // 到 [^'] 处理第二个 \ 并正确关闭。如果后续有 ' 存在（例如，
      // 下一个单引号参数的开头符），则不会回溯，
      // 令牌合并。参见 H1 报告：git ls-remote 'safe\' '--upload-pack=evil' 'repo'
      // shell-quote: ["git","ls-remote","safe\\ --upload-pack=evil repo"]
      // bash:        ["git","ls-remote","safe\\\\","--upload-pack=evil","repo"]
      if (!inSingleQuote) {
        let backslashCount = 0
        let j = i - 1
        while (j >= 0 && command[j] === '\\') {
          backslashCount++
          j--
        }
        if (backslashCount > 0 && backslashCount % 2 === 1) {
          return true
        }
        // 偶数个尾部反斜杠：仅当后续存在 ' 时才是 bug
        // chunker 正则可用作假关闭引号。我们检查
        // 任何后续的 '，因为正则不尊重 bash 引号状态
        // （例如，双引号内的 ' 也是可消耗的）
        if (
          backslashCount > 0 &&
          backslashCount % 2 === 0 &&
          command.indexOf("'", i + 1) !== -1
        ) {
          return true
        }
      }
      continue
    }
  }

  return false
}

export function quote(args: ReadonlyArray<unknown>): string {
  // 首先尝试严格验证
  const result = tryQuoteShellArgs([...args])

  if (result.success) {
    return result.quoted
  }

  // 如果严格验证失败，使用宽松的回退方案
  // 这处理对象、符号、函数等，通过将它们转换为字符串
  try {
    const stringArgs = args.map(arg => {
      if (arg === null || arg === undefined) {
        return String(arg)
      }

      const type = typeof arg

      if (type === 'string' || type === 'number' || type === 'boolean') {
        return String(arg)
      }

      // 对于不支持的类型，使用 JSON.stringify 作为安全回退
      // 这确保我们不会崩溃，同时获得有意义的表示
      return jsonStringify(arg)
    })

    return shellQuoteQuote(stringArgs)
  } catch (error) {
    // 安全：绝不要使用 JSON.stringify 作为 shell 引用的回退。
    // JSON.stringify 使用双引号，无法阻止 shell 命令执行。
    // 例如，jsonStringify(['echo', '$(whoami)']) 产生 "echo" "$(whoami)"
    if (error instanceof Error) {
      logError(error)
    }
    throw new Error('Failed to quote shell arguments safely')
  }
}
