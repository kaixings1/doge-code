import {
  hasMalformedTokens,
  hasShellQuoteSingleQuoteBug,
  type ParseEntry,
  quote,
  tryParseShellCommand,
} from './shellQuote.js'

/**
 * 重排管道命令，将 stdin 重定向放在第一个命令之后。
 * 这修复了 eval 将整个管道命令视为一个单元的问题，
 * 导致 stdin 重定向应用到 eval 本身而非第一个命令。
 */
export function rearrangePipeCommand(command: string): string {
  // 跳过包含反引号的命令 — shell-quote 无法正确处理它们
  if (command.includes('`')) {
    return quoteWithEvalStdinRedirect(command)
  }

  // 跳过包含命令替换的命令 — shell-quote 错误地解析 $()，
  // 将 ( 和 ) 视为独立操作符而非识别为命令替换
  if (command.includes('$(')) {
    return quoteWithEvalStdinRedirect(command)
  }

  // 跳过引用 shell 变量（$VAR, ${VAR}）的命令。shell-quote 的 parse()
  // 在未传递环境变量时将这些扩展为空字符串，静默地丢弃引用。
  // 即使我们通过 env 函数保留了令牌，quote() 在重建时也会转义 $，
  // 阻止运行时扩展。参见 #9732。
  if (/\$[A-Za-z_{]/.test(command)) {
    return quoteWithEvalStdinRedirect(command)
  }

  // 跳过包含 bash 控制结构（for/while/until/if/case/select）的命令
  // shell-quote 无法正确解析这些结构，会错误地在控制结构体内
  // 找到管道符号，破坏命令的重排
  if (containsControlStructure(command)) {
    return quoteWithEvalStdinRedirect(command)
  }

  // 在解析前连接续行：shell-quote 不处理 \<换行>
  // 并为每个出现产生空字符串令牌，导致重建的命令中出现
  // 虚假的空参数
  const joined = joinContinuationLines(command)

  // shell-quote 将裸换行符视为空白符而非命令分隔符。
  // 解析+重建 'cmd1 | head\ncmd2 | grep' 会产生 'cmd1 | head cmd2 | grep'，
  // 静默地合并管道。行续接（\<换行>）已在上面剥离；
  // 任何剩余的换行符都是真实的分隔符。回退到 eval 方案，
  // 它在单引号参数内保留换行符。参见 #32515。
  if (joined.includes('\n')) {
    return quoteWithEvalStdinRedirect(command)
  }

  // 安全：shell-quote 将单引号内的 \' 视为转义，但
  // bash 将其视为字面反斜杠后跟关闭引号。模式
  // '\' <负载> '\' 使 shell-quote 将 <负载> 合并到引号
  // 字符串中，隐藏了令牌流中的 ; 等操作符。基于合并后的
  // 令牌重建会在 bash 重新解析时暴露这些操作符。
  if (hasShellQuoteSingleQuoteBug(joined)) {
    return quoteWithEvalStdinRedirect(command)
  }

  const parseResult = tryParseShellCommand(joined)

  // 如果解析失败（语法格式错误），回退到引用整个命令
  if (!parseResult.success) {
    return quoteWithEvalStdinRedirect(command)
  }

  const parsed = parseResult.tokens

  // 安全：shell-quote 的令牌化方式与 bash 不同。输入如
  // `echo {"hi":\"hi;calc.exe"}` 是 bash 语法错误（引号不平衡），
  // 但 shell-quote 将其解析为以 `;` 为操作符和 `calc.exe` 作为
  // 独立单词的令牌。基于这些令牌重建会产生有效的 bash 代码，
  // 执行 `calc.exe` — 将语法错误转变为注入。
  // 字符串令牌中不平衡的分隔符标志着这种误解析；
  // 回退到整个命令引用，保留原始命令（bash 随后会以与
  // 没有我们介入时相同的语法错误拒绝它）。
  if (hasMalformedTokens(joined, parsed)) {
    return quoteWithEvalStdinRedirect(command)
  }

  const firstPipeIndex = findFirstPipeOperator(parsed)

  if (firstPipeIndex <= 0) {
    return quoteWithEvalStdinRedirect(command)
  }

  // 重建：first_command < /dev/null | rest_of_pipeline
  const parts = [
    ...buildCommandParts(parsed, 0, firstPipeIndex),
    '< /dev/null',
    ...buildCommandParts(parsed, firstPipeIndex, parsed.length),
  ]

  return singleQuoteForEval(parts.join(' '))
}

/**
 * 查找解析后 shell 命令中第一个管道操作符的索引
 */
function findFirstPipeOperator(parsed: ParseEntry[]): number {
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i]
    if (isOperator(entry, '|')) {
      return i
    }
  }
  return -1
}

/**
 * 从解析后的条目构建命令部分，处理字符串和操作符。
 * 对文件描述符重定向进行特殊处理，将其保留为单一单元。
 */
function buildCommandParts(
  parsed: ParseEntry[],
  start: number,
  end: number,
): string[] {
  const parts: string[] = []
  // 跟踪是否已见过非环境变量的字符串令牌
  // 环境变量仅在命令开头有效
  let seenNonEnvVar = false

  for (let i = start; i < end; i++) {
    const entry = parsed[i]

    // 检查文件描述符重定向（例如 2>&1, 2>/dev/null）
    if (
      typeof entry === 'string' &&
      /^[012]$/.test(entry) &&
      i + 2 < end &&
      isOperator(parsed[i + 1])
    ) {
      const op = parsed[i + 1] as { op: string }
      const target = parsed[i + 2]

      // 处理 2>&1 风格的重定向
      if (
        op.op === '>&' &&
        typeof target === 'string' &&
        /^[012]$/.test(target)
      ) {
        parts.push(`${entry}>&${target}`)
        i += 2
        continue
      }

      // 处理 2>/dev/null 风格的重定向
      if (op.op === '>' && target === '/dev/null') {
        parts.push(`${entry}>/dev/null`)
        i += 2
        continue
      }

      // 处理 2> &1 风格（> 和 &1 之间有空格）
      if (
        op.op === '>' &&
        typeof target === 'string' &&
        target.startsWith('&')
      ) {
        const fd = target.slice(1)
        if (/^[012]$/.test(fd)) {
          parts.push(`${entry}>&${fd}`)
          i += 2
          continue
        }
      }
    }

    // 处理常规条目
    if (typeof entry === 'string') {
      // 环境变量赋值仅在命令开头有效，
      // 在任何非环境变量令牌（实际命令及其参数）之前
      const isEnvVar = !seenNonEnvVar && isEnvironmentVariableAssignment(entry)

      if (isEnvVar) {
        // 对于环境变量赋值，需要保留 = 但根据需要引用值
        // 拆分为名称和值两部分
        const eqIndex = entry.indexOf('=')
        const name = entry.slice(0, eqIndex)
        const value = entry.slice(eqIndex + 1)

        // 引用值部分以处理空格和特殊字符
        const quotedValue = quote([value])
        parts.push(`${name}=${quotedValue}`)
      } else {
        // 一旦看到非环境变量字符串，后续所有字符串都是参数
        seenNonEnvVar = true
        parts.push(quote([entry]))
      }
    } else if (isOperator(entry)) {
      // 对通配符操作符的特殊处理
      if (entry.op === 'glob' && 'pattern' in entry) {
        // 不要引用通配符模式 — 它们需要保持原样以便 shell 展开
        parts.push(entry.pattern as string)
      } else {
        parts.push(entry.op)
        // 在命令分隔符后重置 — 下一个命令可以有它自己的环境变量
        if (isCommandSeparator(entry.op)) {
          seenNonEnvVar = false
        }
      }
    }
  }

  return parts
}

/**
 * 检查字符串是否为环境变量赋值（VAR=value）
 * 环境变量名必须以字母或下划线开头，
 * 后跟字母、数字或下划线
 */
function isEnvironmentVariableAssignment(str: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(str)
}

/**
 * 检查操作符是否为启动新命令上下文的命令分隔符。
 * 在这些操作符之后，环境变量赋值再次有效。
 */
function isCommandSeparator(op: string): boolean {
  return op === '&&' || op === '||' || op === ';'
}

/**
 * 类型守卫，检查解析后的条目是否为操作符
 */
function isOperator(entry: unknown, op?: string): entry is { op: string } {
  if (!entry || typeof entry !== 'object' || !('op' in entry)) {
    return false
  }
  return op ? entry.op === op : true
}

/**
 * 检查命令是否包含 shell-quote 无法解析的 bash 控制结构。
 * 这些包括 for/while/until/if/case/select 循环和条件语句。
 * 我们匹配关键字后跟空白符，以避免与恰好包含这些单词的命令
 * 或参数产生误报。
 */
function containsControlStructure(command: string): boolean {
  return /\b(for|while|until|if|case|select)\s/.test(command)
}

/**
 * 引用命令并将 `< /dev/null` 添加为 eval 上的 shell 重定向，而不是
 * 作为 eval 参数。这对于我们无法解析管道边界的管道命令至关重要
 * （例如带有 $()、反引号或控制结构的命令）。
 *
 * 使用 `singleQuoteForEval(cmd) + ' < /dev/null'` 产生：eval 'cmd' < /dev/null
 *   → eval 的 stdin 是 /dev/null，eval 求值 'cmd'，内部的管道正确工作
 *
 * 之前的方法 `quote([cmd, '<', '/dev/null'])` 产生：eval 'cmd' \< /dev/null
 *   → eval 将参数拼接为 'cmd < /dev/null'，重定向应用到最后一个管道命令
 */
function quoteWithEvalStdinRedirect(command: string): string {
  return singleQuoteForEval(command) + ' < /dev/null'
}

/**
 * 用单引号引用字符串以用作 eval 参数。通过 '"'"' 转义嵌入的单引号
 * （关闭单引号、双引号中的字面单引号、重新打开单引号）。用于替代
 * shell-quote 的 quote()，后者在输入包含单引号时会切换到双引号模式，
 * 然后将 ! 转义为 \!，将 `select(.x != .y)` 这样的 jq/awk 过滤器
 * 破坏为 `select(.x \!= .y)`。
 */
function singleQuoteForEval(s: string): string {
  return "'" + s.replace(/'/g, `'"'"'`) + "'"
}

/**
 * 将 shell 续行（反斜杠-换行）连接到一行。
 * 仅当换行符前有奇数个反斜杠时才连接
 * （最后一个转义了换行符）。偶数个反斜杠成对作为转义序列，
 * 换行符仍为分隔符。
 */
function joinContinuationLines(command: string): string {
  return command.replace(/\\+\n/g, match => {
    const backslashCount = match.length - 1 // -1 减去换行符
    if (backslashCount % 2 === 1) {
      // 奇数：最后一个反斜杠转义换行符（续行）
      return '\\'.repeat(backslashCount - 1)
    } else {
      // 偶数：全部配对，换行符是真正的分隔符
      return match
    }
  })
}
