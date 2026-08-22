/**
 * Centralized utilities for parsing slash commands
 *
 * 始终使用首词解析模式：第一个空格前的词为命令名，其余为参数。
 * 中文技能名（如 "Windows C++ 项目生成器"）的模糊匹配
 * 由上层 processSlashCommand 的模糊搜索（searchSkillByNameOrDescription）处理。
 *
 * 示例：
 * - `/task 帮我修复bug` → commandName="task", args="帮我修复bug"
 * - `/Windows C++ 项目生成器 D:/proj` → commandName="Windows", args="C++ 项目 生成器 D:/proj"
 *   （之后由模糊搜索匹配到 "Windows C++ 项目生成器" 技能）
 * - `/commit --amend` → commandName="commit", args="--amend"
 */

export type ParsedSlashCommand = {
  commandName: string
  args: string
  isMcp: boolean
}

/**
 * 检查字符串是否包含中文字符（CJK统一表意文字 / 中文标点）
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(text)
}

/**
 * 查找单词数组中最后一个包含中文的词的下标
 */
function findLastChineseWordIndex(words: string[]): number {
  for (let i = words.length - 1; i >= 0; i--) {
    if (containsChinese(words[i]!)) {
      return i
    }
  }
  return -1
}

/**
 * Returns the command trigger character for an input string, or empty string if not a command.
 *
 * Trigger mapping:
 *   /  -> built-in slash command  (e.g. /commit, /review-pr)
 *   >  -> skill/prompt command     (e.g. >plan, >langgraph)
 *   <  -> skill/prompt command     (alternative prefix for >)
 *   @  -> agent spawn              (e.g. @debug, @review, @arch)
 *   #  -> tag/filter command       (e.g. #todo, #fixme, #security)
 *   &  -> background task          (e.g. & analyze, & build)
 *   |  -> pipe command             (e.g. | grep error, | files)
 *   $  -> quick calc/env           (e.g. $ 2+2, $ env)
 *   =  -> variable assignment      (e.g. = base_url=xxx)
 *   ^  -> result filter            (e.g. ^ grep error)
 *   %  -> diff comparison          (e.g. % main, % src/a.ts src/b.ts)
 */
export function getCommandTrigger(input: string): '/' | '>' | '<' | '@' | '#' | '&' | '|' | '$' | '=' | '^' | '%' | '' {
  const trimmed = input.trim()
  if (trimmed.startsWith('/')) return '/'
  if (trimmed.startsWith('>')) return '>'
  if (trimmed.startsWith('<')) return '<'
  if (trimmed.startsWith('@')) return '@'
  if (trimmed.startsWith('#')) return '#'
  if (trimmed.startsWith('&')) return '&'
  if (trimmed.startsWith('|')) return '|'
  if (trimmed.startsWith('$')) return '$'
  if (trimmed.startsWith('=')) return '='
  if (trimmed.startsWith('^')) return '^'
  if (trimmed.startsWith('%')) return '%'
  return ''
}

/**
 * Parses a slash command input string into its component parts.
 * Supports / > < @ # & | $ = ^ % 等所有触发符前缀。
 *
 * @param input - The raw input string (should start with a trigger character)
 * @returns Parsed command name, args, and MCP flag, or null if invalid
 *
 * @example
 * parseSlashCommand('/search foo bar')
 * // => { commandName: 'search', args: 'foo bar', isMcp: false }
 *
 * @example
 * parseSlashCommand('@debug 登录接口报错')
 * // => { commandName: 'debug', args: '登录接口报错', isMcp: false }
 *
 * @example
 * parseSlashCommand('| grep error')
 * // => { commandName: 'grep', args: 'error', isMcp: false }
 *
 * @example
 * parseSlashCommand('$ 2+2')
 * // => { commandName: '2+2', args: '', isMcp: false }
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmedInput = input.trim()
  const trigger = getCommandTrigger(trimmedInput)
  if (trigger === '') {
    return null
  }

  // Remove the leading trigger character and split by spaces
  const withoutPrefix = trimmedInput.slice(1)
  const words = withoutPrefix.split(' ')

  if (!words[0]) {
    return null
  }

  let commandName: string
  let isMcp = false
  let argsStartIndex: number

  // 统一使用首词解析模式，中文技能名由上层模糊搜索处理
  commandName = words[0]
  argsStartIndex = 1

  // Check for MCP commands (second word is '(MCP)')
  if (words.length > 1 && words[1] === '(MCP)') {
    commandName = commandName + ' (MCP)'
    isMcp = true
    argsStartIndex = 2
  }

  // Extract arguments (everything after command name)
  const args = words.slice(argsStartIndex).join(' ')

  return {
    commandName,
    args,
    isMcp,
  }
}
