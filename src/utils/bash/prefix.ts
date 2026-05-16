import { buildPrefix } from '../shell/specPrefix.js'
import { splitCommand_DEPRECATED } from './commands.js'
import { extractCommandArguments, parseCommand } from './parser.js'
import { getCommandSpec } from './registry.js'

const NUMERIC = /^\d+$/
const ENV_VAR = /^[A-Za-z_][A-Za-z0-9_]*=/

// 具有复杂选项处理的包装命令，无法在 specs 中表达
const WRAPPER_COMMANDS = new Set([
  'nice', // 命令位置根据选项而变化
])

const toArray = <T>(val: T | T[]): T[] => (Array.isArray(val) ? val : [val])

// 检查 args[0] 是否匹配已知的子命令（消除同时拥有子命令的包装命令歧义，
// 例如 git spec 为别名设置了 isCommand 参数）。
function isKnownSubcommand(
  arg: string,
  spec: { subcommands?: { name: string | string[] }[] } | null,
): boolean {
  if (!spec?.subcommands?.length) return false
  return spec.subcommands.some(sub =>
    Array.isArray(sub.name) ? sub.name.includes(arg) : sub.name === arg,
  )
}

export async function getCommandPrefixStatic(
  command: string,
  recursionDepth = 0,
  wrapperCount = 0,
): Promise<{ commandPrefix: string | null } | null> {
  if (wrapperCount > 2 || recursionDepth > 10) return null

  const parsed = await parseCommand(command)
  if (!parsed) return null
  if (!parsed.commandNode) {
    return { commandPrefix: null }
  }

  const { envVars, commandNode } = parsed
  const cmdArgs = extractCommandArguments(commandNode)

  const [cmd, ...args] = cmdArgs
  if (!cmd) return { commandPrefix: null }

  // 通过查看 spec 检查是否为包装命令
  const spec = await getCommandSpec(cmd)
  // 检查是否为包装命令
  let isWrapper =
    WRAPPER_COMMANDS.has(cmd) ||
    (spec?.args && toArray(spec.args).some(arg => arg?.isCommand))

  // 特殊情况：如果命令有子命令且第一个参数匹配子命令，
  // 将其视为常规命令而非包装命令
  if (isWrapper && args[0] && isKnownSubcommand(args[0], spec)) {
    isWrapper = false
  }

  const prefix = isWrapper
    ? await handleWrapper(cmd, args, recursionDepth, wrapperCount)
    : await buildPrefix(cmd, args, spec)

  if (prefix === null && recursionDepth === 0 && isWrapper) {
    return null
  }

  const envPrefix = envVars.length ? `${envVars.join(' ')} ` : ''
  return { commandPrefix: prefix ? envPrefix + prefix : null }
}

async function handleWrapper(
  command: string,
  args: string[],
  recursionDepth: number,
  wrapperCount: number,
): Promise<string | null> {
  const spec = await getCommandSpec(command)

  if (spec?.args) {
    const commandArgIndex = toArray(spec.args).findIndex(arg => arg?.isCommand)

    if (commandArgIndex !== -1) {
      const parts = [command]

      for (let i = 0; i < args.length && i <= commandArgIndex; i++) {
        if (i === commandArgIndex) {
          const result = await getCommandPrefixStatic(
            args.slice(i).join(' '),
            recursionDepth + 1,
            wrapperCount + 1,
          )
          if (result?.commandPrefix) {
            parts.push(...result.commandPrefix.split(' '))
            return parts.join(' ')
          }
          break
        } else if (
          args[i] &&
          !args[i]!.startsWith('-') &&
          !ENV_VAR.test(args[i]!)
        ) {
          parts.push(args[i]!)
        }
      }
    }
  }

  const wrapped = args.find(
    arg => !arg.startsWith('-') && !NUMERIC.test(arg) && !ENV_VAR.test(arg),
  )
  if (!wrapped) return command

  const result = await getCommandPrefixStatic(
    args.slice(args.indexOf(wrapped)).join(' '),
    recursionDepth + 1,
    wrapperCount + 1,
  )

  return !result?.commandPrefix ? null : `${command} ${result.commandPrefix}`
}

/**
 * 计算复合命令的前缀（含 && / || / ;）。
 * 对于单个命令，返回包含前缀的单元素数组。
 *
 * 对于复合命令，计算每个子命令的前缀并合并：
 * 共享根（第一个单词）的子命令通过单词对齐的最长公共前缀合并。
 *
 * @param excludeSubcommand — 可选过滤器；对应从前缀建议中排除的
 *   子命令返回 true（例如已经自动允许的只读命令）。
 */
export async function getCompoundCommandPrefixesStatic(
  command: string,
  excludeSubcommand?: (subcommand: string) => boolean,
): Promise<string[]> {
  const subcommands = splitCommand_DEPRECATED(command)
  if (subcommands.length <= 1) {
    const result = await getCommandPrefixStatic(command)
    return result?.commandPrefix ? [result.commandPrefix] : []
  }

  const prefixes: string[] = []
  for (const subcmd of subcommands) {
    const trimmed = subcmd.trim()
    if (excludeSubcommand?.(trimmed)) continue
    const result = await getCommandPrefixStatic(trimmed)
    if (result?.commandPrefix) {
      prefixes.push(result.commandPrefix)
    }
  }

  if (prefixes.length === 0) return []

  // 按第一个单词（根命令）对前缀分组
  const groups = new Map<string, string[]>()
  for (const prefix of prefixes) {
    const root = prefix.split(' ')[0]!
    const group = groups.get(root)
    if (group) {
      group.push(prefix)
    } else {
      groups.set(root, [prefix])
    }
  }

  // 通过单词对齐的 LCP 合并每组
  const collapsed: string[] = []
  for (const [, group] of groups) {
    collapsed.push(longestCommonPrefix(group))
  }
  return collapsed
}

/**
 * 计算字符串的最长公共前缀，对齐到单词边界。
 * 例如：["git fetch", "git worktree"] → "git"
 *      ["npm run test", "npm run lint"] → "npm run"
 */
function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  if (strings.length === 1) return strings[0]!

  const first = strings[0]!
  const words = first.split(' ')
  let commonWords = words.length

  for (let i = 1; i < strings.length; i++) {
    const otherWords = strings[i]!.split(' ')
    let shared = 0
    while (
      shared < commonWords &&
      shared < otherWords.length &&
      words[shared] === otherWords[shared]
    ) {
      shared++
    }
    commonWords = shared
  }

  return words.slice(0, Math.max(1, commonWords)).join(' ')
}
