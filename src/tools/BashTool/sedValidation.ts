import type { ToolPermissionContext } from '../../Tool.js'
import { splitCommand_DEPRECATED } from '../../utils/bash/commands.js'
import { tryParseShellCommand } from '../../utils/bash/shellQuote.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'

/**
 * 辅助函数：根据允许列表验证标志
 * 处理单个标志和组合标志（例如 -nE）
 * @param flags 要验证的标志数组
 * @param allowedFlags 允许的单字符和长标志数组
 * @returns 所有标志都有效则返回 true，否则返回 false
 */
function validateFlagsAgainstAllowlist(
  flags: string[],
  allowedFlags: string[],
): boolean {
  for (const flag of flags) {
    // 处理组合标志，如 -nE 或 -Er
    if (flag.startsWith('-') && !flag.startsWith('--') && flag.length > 2) {
      // 检查组合标志中的每个字符
      for (let i = 1; i < flag.length; i++) {
        const singleFlag = '-' + flag[i]
        if (!allowedFlags.includes(singleFlag)) {
          return false
        }
      }
    } else {
      // 单个标志或长标志
      if (!allowedFlags.includes(flag)) {
        return false
      }
    }
  }
  return true
}

/**
 * 模式 1：检查是否为带 -n 标志的行打印命令
 * 允许：sed -n 'N' | sed -n 'N,M'，可附带 -E、-r、-z 标志
 * 允许分号分隔的打印命令，如：sed -n '1p;2p;3p'
 * 此模式允许文件参数
 * @internal 为测试导出
 */
export function isLinePrintingCommand(
  command: string,
  expressions: string[],
): boolean {
  const sedMatch = command.match(/^\s*sed\s+/)
  if (!sedMatch) return false

  const withoutSed = command.slice(sedMatch[0].length)
  const parseResult = tryParseShellCommand(withoutSed)
  if (!parseResult.success) return false
  const parsed = parseResult.tokens

  // 提取所有标志
  const flags: string[] = []
  for (const arg of parsed) {
    if (typeof arg === 'string' && arg.startsWith('-') && arg !== '--') {
      flags.push(arg)
    }
  }

  // 验证标志——仅允许 -n、-E、-r、-z 及其长格式
  const allowedFlags = [
    '-n',
    '--quiet',
    '--silent',
    '-E',
    '--regexp-extended',
    '-r',
    '-z',
    '--zero-terminated',
    '--posix',
  ]

  if (!validateFlagsAgainstAllowlist(flags, allowedFlags)) {
    return false
  }

  // 检查是否存在 -n 标志（模式 1 必需）
  let hasNFlag = false
  for (const flag of flags) {
    if (flag === '-n' || flag === '--quiet' || flag === '--silent') {
      hasNFlag = true
      break
    }
    // 在组合标志中检查
    if (flag.startsWith('-') && !flag.startsWith('--') && flag.includes('n')) {
      hasNFlag = true
      break
    }
  }

  // 模式 1 必须含有 -n 标志
  if (!hasNFlag) {
    return false
  }

  // 必须至少有一个表达式
  if (expressions.length === 0) {
    return false
  }

  // 所有表达式必须为打印命令（严格允许列表）
  // 允许分号分隔的命令
  for (const expr of expressions) {
    const commands = expr.split(';')
    for (const cmd of commands) {
      if (!isPrintCommand(cmd.trim())) {
        return false
      }
    }
  }

  return true
}

/**
 * 辅助函数：检查单个命令是否为有效的打印命令
 * 严格允许列表——仅允许以下精确形式：
 * - p（打印全部）
 * - Np（打印第 N 行，N 为数字）
 * - N,Mp（打印第 N 到 M 行）
 * 其他任何内容（包括 w、W、e、E 命令）均被拒绝。
 * @internal 为测试导出
 */
export function isPrintCommand(cmd: string): boolean {
  if (!cmd) return false
  // 单个严格正则表达式，仅匹配允许的打印命令
  // ^(?:\d+|\d+,\d+)?p$ 匹配：p、1p、123p、1,5p、10,200p
  return /^(?:\d+|\d+,\d+)?p$/.test(cmd)
}

/**
 * 模式 2：检查是否为替换命令
 * 允许：sed 's/pattern/replacement/flags'，其中 flags 仅限：g、p、i、I、m、M、1-9
 * 当 allowFileWrites 为 true 时，允许 -i 标志和文件参数进行原地编辑
 * 当 allowFileWrites 为 false（默认）时，仅限 stdout 输出（无文件参数，无 -i 标志）
 * @internal 为测试导出
 */
function isSubstitutionCommand(
  command: string,
  expressions: string[],
  hasFileArguments: boolean,
  options?: { allowFileWrites?: boolean },
): boolean {
  const allowFileWrites = options?.allowFileWrites ?? false

  // 不允许文件写入时，不能有文件参数
  if (!allowFileWrites && hasFileArguments) {
    return false
  }

  const sedMatch = command.match(/^\s*sed\s+/)
  if (!sedMatch) return false

  const withoutSed = command.slice(sedMatch[0].length)
  const parseResult = tryParseShellCommand(withoutSed)
  if (!parseResult.success) return false
  const parsed = parseResult.tokens

  // 提取所有标志
  const flags: string[] = []
  for (const arg of parsed) {
    if (typeof arg === 'string' && arg.startsWith('-') && arg !== '--') {
      flags.push(arg)
    }
  }

  // 根据模式验证标志
  // 两种模式共用的基础允许标志
  const allowedFlags = ['-E', '--regexp-extended', '-r', '--posix']

  // 允许文件写入时，同时允许 -i 和 --in-place
  if (allowFileWrites) {
    allowedFlags.push('-i', '--in-place')
  }

  if (!validateFlagsAgainstAllowlist(flags, allowedFlags)) {
    return false
  }

  // 必须恰好有一个表达式
  if (expressions.length !== 1) {
    return false
  }

  const expr = expressions[0]!.trim()

  // 严格允许列表：必须是一个以 's' 开头的替换命令
  // 这会拒绝像 'e'、'w file' 等独立命令
  if (!expr.startsWith('s')) {
    return false
  }

  // 解析替换命令：s/pattern/replacement/flags
  // 仅允许 / 作为分隔符（严格）
  const substitutionMatch = expr.match(/^s\/(.*?)$/)
  if (!substitutionMatch) {
    return false
  }

  const rest = substitutionMatch[1]!

  // 查找 / 分隔符的位置
  let delimiterCount = 0
  let lastDelimiterPos = -1
  let i = 0
  while (i < rest.length) {
    if (rest[i] === '\\') {
      // 跳过转义字符
      i += 2
      continue
    }
    if (rest[i] === '/') {
      delimiterCount++
      lastDelimiterPos = i
    }
    i++
  }

  // 必须恰好找到 2 个分隔符（模式和替换）
  if (delimiterCount !== 2) {
    return false
  }

  // 提取标志（最后一个分隔符之后的所有内容）
  const exprFlags = rest.slice(lastDelimiterPos + 1)

  // 验证标志：仅允许 g、p、i、I、m、M 和可选的一个数字 1-9
  const allowedFlagChars = /^[gpimIM]*[1-9]?[gpimIM]*$/
  if (!allowedFlagChars.test(exprFlags)) {
    return false
  }

  return true
}

/**
 * 检查 sed 命令是否被允许列表允许。
 * 允许列表模式本身足够严格，可以拒绝危险操作。
 * @param command 要检查的 sed 命令
 * @param options.allowFileWrites 为 true 时，允许替换命令使用 -i 标志和文件参数
 * @returns 命令被允许（匹配允许列表并通过拒绝列表检查）返回 true，否则返回 false
 */
export function sedCommandIsAllowedByAllowlist(
  command: string,
  options?: { allowFileWrites?: boolean },
): boolean {
  const allowFileWrites = options?.allowFileWrites ?? false

  // 提取 sed 表达式（引号内的内容，即实际的 sed 命令所在位置）
  let expressions: string[]
  try {
    expressions = extractSedExpressions(command)
  } catch (_error) {
    // 如果解析失败，视为不允许
    return false
  }

  // 检查 sed 命令是否有文件参数
  const hasFileArguments = hasFileArgs(command)

  // 检查命令是否匹配允许列表模式
  let isPattern1 = false
  let isPattern2 = false

  if (allowFileWrites) {
    // 允许文件写入时，仅检查替换命令（模式 2 变体）
    // 模式 1（行打印）不需要文件写入
    isPattern2 = isSubstitutionCommand(command, expressions, hasFileArguments, {
      allowFileWrites: true,
    })
  } else {
    // 标准只读模式：检查两种模式
    isPattern1 = isLinePrintingCommand(command, expressions)
    isPattern2 = isSubstitutionCommand(command, expressions, hasFileArguments)
  }

  if (!isPattern1 && !isPattern2) {
    return false
  }

  // 模式 2 不允许分号（命令分隔符）
  // 模式 1 允许分号分隔打印命令
  for (const expr of expressions) {
    if (isPattern2 && expr.includes(';')) {
      return false
    }
  }

  // 深度防御：即使匹配允许列表，也要检查拒绝列表
  for (const expr of expressions) {
    if (containsDangerousOperations(expr)) {
      return false
    }
  }

  return true
}

/**
 * 检查 sed 命令是否有文件参数（不仅仅是 stdin）
 * @internal 为测试导出
 */
export function hasFileArgs(command: string): boolean {
  const sedMatch = command.match(/^\s*sed\s+/)
  if (!sedMatch) return false

  const withoutSed = command.slice(sedMatch[0].length)
  const parseResult = tryParseShellCommand(withoutSed)
  if (!parseResult.success) return true
  const parsed = parseResult.tokens

  try {
    let argCount = 0
    let hasEFlag = false

    for (let i = 0; i < parsed.length; i++) {
      const arg = parsed[i]

      // 处理字符串参数和 glob 模式（如 *.log）
      if (typeof arg !== 'string' && typeof arg !== 'object') continue

      // 如果是 glob 模式，则视为文件参数
      if (
        typeof arg === 'object' &&
        arg !== null &&
        'op' in arg &&
        arg.op === 'glob'
      ) {
        return true
      }

      // 跳过非 glob 模式且非字符串的参数
      if (typeof arg !== 'string') continue

      // 处理 -e 标志后跟表达式的情况
      if ((arg === '-e' || arg === '--expression') && i + 1 < parsed.length) {
        hasEFlag = true
        i++ // 跳过下一个参数，因为它是表达式
        continue
      }

      // 处理 --expression=value 格式
      if (arg.startsWith('--expression=')) {
        hasEFlag = true
        continue
      }

      // 处理 -e=value 格式（非标准但作为深度防御）
      if (arg.startsWith('-e=')) {
        hasEFlag = true
        continue
      }

      // 跳过其他标志
      if (arg.startsWith('-')) continue

      argCount++

      // 如果使用了 -e 标志，所有非标志参数都是文件参数
      if (hasEFlag) {
        return true
      }

      // 如果未使用 -e 标志，第一个非标志参数是 sed 表达式，
      // 因此需要多于 1 个非标志参数才有文件参数
      if (argCount > 1) {
        return true
      }
    }

    return false
  } catch (_error) {
    return true // 解析失败时视为危险
  }
}

/**
 * 从命令中提取 sed 表达式，忽略标志和文件名
 * @param command 完整的 sed 命令
 * @returns 要检查危险操作的 sed 表达式数组
 * @throws 解析失败时抛出错误
 * @internal 为测试导出
 */
export function extractSedExpressions(command: string): string[] {
  const expressions: string[] = []

  // 通过截取前 N 个字符计算 withoutSed（移除 'sed '）
  const sedMatch = command.match(/^\s*sed\s+/)
  if (!sedMatch) return expressions

  const withoutSed = command.slice(sedMatch[0].length)

  // 拒绝危险的标志组合，如 -ew、-eW、-ee、-we（-e/-w 与危险命令的组合）
  if (/-e[wWe]/.test(withoutSed) || /-w[eE]/.test(withoutSed)) {
    throw new Error('检测到危险的标志组合')
  }

  // 使用 shell-quote 正确解析参数
  const parseResult = tryParseShellCommand(withoutSed)
  if (!parseResult.success) {
    // Shell 语法格式错误——抛出错误由调用者捕获
    throw new Error(`Shell 语法格式错误：${parseResult.error}`)
  }
  const parsed = parseResult.tokens
  try {
    let foundEFlag = false
    let foundExpression = false

    for (let i = 0; i < parsed.length; i++) {
      const arg = parsed[i]

      // 跳过非字符串参数（如控制运算符）
      if (typeof arg !== 'string') continue

      // 处理 -e 标志后跟表达式的情况
      if ((arg === '-e' || arg === '--expression') && i + 1 < parsed.length) {
        foundEFlag = true
        const nextArg = parsed[i + 1]
        if (typeof nextArg === 'string') {
          expressions.push(nextArg)
          i++ // 跳过下一个参数，因为已消费
        }
        continue
      }

      // 处理 --expression=value 格式
      if (arg.startsWith('--expression=')) {
        foundEFlag = true
        expressions.push(arg.slice('--expression='.length))
        continue
      }

      // 处理 -e=value 格式（非标准但作为深度防御）
      if (arg.startsWith('-e=')) {
        foundEFlag = true
        expressions.push(arg.slice('-e='.length))
        continue
      }

      // 跳过其他标志
      if (arg.startsWith('-')) continue

      // 如果未找到任何 -e 标志，第一个非标志参数就是 sed 表达式
      if (!foundEFlag && !foundExpression) {
        expressions.push(arg)
        foundExpression = true
        continue
      }

      // 如果已找到 -e 标志或独立表达式，
      // 剩余的非标志参数都是文件名
      break
    }
  } catch (error) {
    // 如果 shell-quote 解析失败，将该 sed 命令视为不安全
    throw new Error(
      `分析 sed 命令失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }

  return expressions
}

/**
 * 检查 sed 表达式是否包含危险操作（拒绝列表）
 * @param expression 单个 sed 表达式（不含引号）
 * @returns 危险返回 true，安全返回 false
 */
function containsDangerousOperations(expression: string): boolean {
  const cmd = expression.trim()
  if (!cmd) return false

  // 保守拒绝：广泛拒绝可能危险的模式
  // 有疑问时，视为不安全

  // 拒绝非 ASCII 字符（Unicode 同形字、组合字符等）
  // 示例：ｗ（全角）、ᴡ（小型大写）、w̃（组合波浪号）
  // 检查 ASCII 范围（0x01-0x7F，排除空字节）之外的字符
   
  if (/[^\x01-\x7F]/.test(cmd)) {
    return true
  }

  // 拒绝花括号（块）——过于复杂难以解析
  if (cmd.includes('{') || cmd.includes('}')) {
    return true
  }

  // 拒绝换行符——多行命令过于复杂
  if (cmd.includes('\n')) {
    return true
  }

  // 拒绝注释（# 不在 s 命令之后紧邻的情况）
  // 注释形式如：#comment 或以 # 开头
  // 分隔符形式如：s#pattern#replacement#
  const hashIndex = cmd.indexOf('#')
  if (hashIndex !== -1 && !(hashIndex > 0 && cmd[hashIndex - 1] === 's')) {
    return true
  }

  // 拒绝否定运算符
  // 否定可出现：开头（!/pattern/）、地址后（/pattern/!、1,10!、$!）
  // 分隔符形式如：s!pattern!replacement!（前面有 's'）
  if (/^!/.test(cmd) || /[/\d$]!/.test(cmd)) {
    return true
  }

  // 拒绝 GNU 步进地址格式中的波浪号（digit~digit、,~digit 或 $~digit）
  // 允许波浪号周围有空白
  if (/\d\s*~\s*\d|,\s*~\s*\d|\$\s*~\s*\d/.test(cmd)) {
    return true
  }

  // 拒绝开头逗号（裸逗号是 1,$ 地址范围的简写）
  if (/^,/.test(cmd)) {
    return true
  }

  // 拒绝逗号后跟 +/-（GNU 偏移地址）
  if (/,\s*[+-]/.test(cmd)) {
    return true
  }

  // 拒绝反斜杠技巧：
  // 1. s\（使用反斜杠作为分隔符的替换命令）
  // 2. \X，其中 X 可能是替代分隔符（|、#、% 等）——不是正则转义
  if (/s\\/.test(cmd) || /\\[|#%@]/.test(cmd)) {
    return true
  }

  // 拒绝转义斜杠后跟 w/W（如 /\/path\/to\/file/w 之类的模式）
  if (/\\\/.*[wW]/.test(cmd)) {
    return true
  }

  // 拒绝无法理解的格式错误/可疑模式
  // 如果斜杠后跟非斜杠字符，然后是空白，然后是危险命令
  // 示例：/pattern w file、/pattern e cmd、/foo X;w file
  if (/\/[^/]*\s+[wWeE]/.test(cmd)) {
    return true
  }

  // 拒绝不符合正常模式的格式错误替换命令
  // 示例：s/foobareoutput.txt（缺少分隔符）、s/foo/bar//w（多余分隔符）
  if (/^s\//.test(cmd) && !/^s\/[^/]*\/[^/]*\/[^/]*$/.test(cmd)) {
    return true
  }

  // 偏执检查：拒绝任何以 's' 开头、以危险字符（w、W、e、E）结尾
  // 且不匹配已知安全替换模式的命令。这可以捕获使用非斜杠分隔符
  // 但可能试图使用危险标志的格式错误 s 命令。
  if (/^s./.test(cmd) && /[wWeE]$/.test(cmd)) {
    // 检查是否为格式正确的替换命令（任何分隔符，不限于 /）
    const properSubst = /^s([^\\\n]).*?\1.*?\1[^wWeE]*$/.test(cmd)
    if (!properSubst) {
      return true
    }
  }

  // 检查危险的写入命令
  // 模式：[address]w filename、[address]W filename、/pattern/w filename、/pattern/W filename
  // 已简化以避免指数级回溯（CodeQL 问题）
  // 检查 w/W 出现在上下文中的命令位置（带可选空白）
  if (
    /^[wW]\s*\S+/.test(cmd) || // 开头：w file
    /^\d+\s*[wW]\s*\S+/.test(cmd) || // 行号后：1w file 或 1 w file
    /^\$\s*[wW]\s*\S+/.test(cmd) || // $ 后：$w file 或 $ w file
    /^\/[^/]*\/[IMim]*\s*[wW]\s*\S+/.test(cmd) || // 模式后：/pattern/w file
    /^\d+,\d+\s*[wW]\s*\S+/.test(cmd) || // 范围后：1,10w file
    /^\d+,\$\s*[wW]\s*\S+/.test(cmd) || // 范围后：1,$w file
    /^\/[^/]*\/[IMim]*,\/[^/]*\/[IMim]*\s*[wW]\s*\S+/.test(cmd) // 模式范围后：/s/,/e/w file
  ) {
    return true
  }

  // 检查危险的执行命令
  // 模式：[address]e [command]、/pattern/e [command] 或以 e 开头的命令
  // 已简化以避免指数级回溯（CodeQL 问题）
  // 检查 e 出现在上下文中的命令位置（带可选空白）
  if (
    /^e/.test(cmd) || // 开头：e cmd
    /^\d+\s*e/.test(cmd) || // 行号后：1e 或 1 e
    /^\$\s*e/.test(cmd) || // $ 后：$e 或 $ e
    /^\/[^/]*\/[IMim]*\s*e/.test(cmd) || // 模式后：/pattern/e
    /^\d+,\d+\s*e/.test(cmd) || // 范围后：1,10e
    /^\d+,\$\s*e/.test(cmd) || // 范围后：1,$e
    /^\/[^/]*\/[IMim]*,\/[^/]*\/[IMim]*\s*e/.test(cmd) // 模式范围后：/s/,/e/e
  ) {
    return true
  }

  // 检查带有危险标志的替换命令
  // 模式：s<delim>pattern<delim>replacement<delim>flags，其中 flags 包含 w 或 e
  // 根据 POSIX，sed 允许除反斜杠和换行符之外的任何字符作为分隔符
  const substitutionMatch = cmd.match(/s([^\\\n]).*?\1.*?\1(.*?)$/)
  if (substitutionMatch) {
    const flags = substitutionMatch[2] || ''

    // 检查写入标志：s/old/new/w filename 或 s/old/new/gw filename
    if (flags.includes('w') || flags.includes('W')) {
      return true
    }

    // 检查执行标志：s/old/new/e 或 s/old/new/ge
    if (flags.includes('e') || flags.includes('E')) {
      return true
    }
  }

  // 检查 y（音译）命令后跟危险操作的情况
  // 模式：y<delim>source<delim>dest<delim> 后跟任何内容
  // y 命令使用与 s 命令相同的分隔符语法
  // 偏执检查：拒绝任何在分隔符后出现 w/W/e/E 的 y 命令
  const yCommandMatch = cmd.match(/y([^\\\n])/)
  if (yCommandMatch) {
    // 如果看到 y 命令，检查整个命令中是否有 w、W、e 或 E
    // 这是偏执但安全的——y 命令很少见，y 后的 w/e 很可疑
    if (/[wWeE]/.test(cmd)) {
      return true
    }
  }

  return false
}

/**
 * sed 命令的横切验证步骤。
 *
 * 这是一个约束检查，无论何种模式都阻止危险的 sed 操作。
 * 非 sed 命令或安全 sed 命令返回 'passthrough'，
 * 危险 sed 操作（w/W/e/E 命令）返回 'ask'。
 *
 * @param input - 包含命令字符串的对象
 * @param toolPermissionContext - 包含模式和权限的上下文
 * @returns
 * - 如果任何 sed 命令包含危险操作则返回 'ask'
 * - 如果没有 sed 命令或全部安全则返回 'passthrough'
 */
export function checkSedConstraints(
  input: { command: string },
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  const commands = splitCommand_DEPRECATED(input.command)

  for (const cmd of commands) {
    // 跳过非 sed 命令
    const trimmed = cmd.trim()
    const baseCmd = trimmed.split(/\s+/)[0]
    if (baseCmd !== 'sed') {
      continue
    }

    // 在 acceptEdits 模式下，允许文件写入（-i 标志），但仍阻止危险操作
    const allowFileWrites = toolPermissionContext.mode === 'acceptEdits'

    const isAllowed = sedCommandIsAllowedByAllowlist(trimmed, {
      allowFileWrites,
    })

    if (!isAllowed) {
      return {
        behavior: 'ask',
        message:
          'sed command requires approval (contains potentially dangerous operations)',
        decisionReason: {
          type: 'other',
          reason:
            'sed command contains operations that require explicit approval (e.g., write commands, execute commands)',
        },
      }
    }
  }

  // 未发现危险的 sed 命令（或根本没有 sed 命令）
  return {
    behavior: 'passthrough',
    message: '未发现危险的 sed 命令',
  }
}
