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
 * Parses a slash command input string into its component parts
 *
 * @param input - The raw input string (should start with '/')
 * @returns Parsed command name, args, and MCP flag, or null if invalid
 *
 * @example
 * parseSlashCommand('/search foo bar')
 * // => { commandName: 'search', args: 'foo bar', isMcp: false }
 *
 * @example
 * parseSlashCommand('/mcp:tool (MCP) arg1 arg2')
 * // => { commandName: 'mcp:tool (MCP)', args: 'arg1 arg2', isMcp: true }
 *
 * @example
 * parseSlashCommand('/Windows C++ 项目生成器 D:/proj')
 * // => { commandName: 'Windows', args: 'C++ 项目 生成器 D:/proj', isMcp: false }
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmedInput = input.trim()

  // Check if input starts with '/'
  if (!trimmedInput.startsWith('/')) {
    return null
  }

  // Remove the leading '/' and split by spaces
  const withoutSlash = trimmedInput.slice(1)
  const words = withoutSlash.split(' ')

  if (!words[0]) {
    return null
  }

  let commandName: string
  let isMcp = false
  let argsStartIndex: number

  // [OLD] 原逻辑：检测任何词含中文就进入中文模式，导致 /task 路径含中文 被吞命令名
  // const lastChineseIdx = findLastChineseWordIndex(words)
  // if (lastChineseIdx >= 0) { ... }
  // 当前统一使用首词解析模式，中文技能名由上层模糊搜索处理

  // 传统英文命令解析逻辑
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
