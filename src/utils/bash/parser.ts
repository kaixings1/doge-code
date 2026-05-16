import { feature } from 'bun:bundle'
import { logEvent } from '../../services/analytics/index.js'
import { logForDebugging } from '../debug.js'
import {
  ensureParserInitialized,
  getParserModule,
  type TsNode,
} from './bashParser.js'

export type Node = TsNode

export interface ParsedCommandData {
  rootNode: Node
  envVars: string[]
  commandNode: Node | null
  originalCommand: string
}

const MAX_COMMAND_LENGTH = 10000
const DECLARATION_COMMANDS = new Set([
  'export',
  'declare',
  'typeset',
  'readonly',
  'local',
  'unset',
  'unsetenv',
])
const ARGUMENT_TYPES = new Set(['word', 'string', 'raw_string', 'number'])
const SUBSTITUTION_TYPES = new Set([
  'command_substitution',
  'process_substitution',
])
const COMMAND_TYPES = new Set(['command', 'declaration_command'])

let logged = false
function logLoadOnce(success: boolean): void {
  if (logged) return
  logged = true
  logForDebugging(
    success ? 'tree-sitter: native module loaded' : 'tree-sitter: unavailable',
  )
  logEvent('tengu_tree_sitter_load', { success })
}

/**
 * 等待 WASM 初始化（Parser.init + Language.load）。必须在
 * parseCommand/parseCommandRaw 之前调用以使解析器可用。幂等。
 */
export async function ensureInitialized(): Promise<void> {
  if (feature('TREE_SITTER_BASH') || feature('TREE_SITTER_BASH_SHADOW')) {
    await ensureParserInitialized()
  }
}

export async function parseCommand(
  command: string,
): Promise<ParsedCommandData | null> {
  if (!command || command.length > MAX_COMMAND_LENGTH) return null

  // 门控：在渗透测试前仅限 ant。外部构建回退到旧版
  // regex/shell-quote 路径。将整个主体放在条件分支内
  // 让 Bun 可以 DCE（死代码消除）NAPI 导入并保持遥测诚实 —
  // 我们仅在真正尝试加载时才触发 tengu_tree_sitter_load。
  if (feature('TREE_SITTER_BASH')) {
    await ensureParserInitialized()
    const mod = getParserModule()
    logLoadOnce(mod !== null)
    if (!mod) return null

    try {
      const rootNode = mod.parse(command)
      if (!rootNode) return null

      const commandNode = findCommandNode(rootNode, null)
      const envVars = extractEnvVars(commandNode)

      return { rootNode, envVars, commandNode, originalCommand: command }
    } catch {
      return null
    }
  }
  return null
}

/**
 * 安全：标记“解析器已加载并尝试执行但被中止”
 *（超时 / 节点预算 / Rust panic）。与 `null`（模块未加载）不同。
 * 对抗性输入可在 MAX_COMMAND_LENGTH 下触发中止：
 * `(( a[0][0]... ))` 约 2800 个下标会触发 PARSE_TIMEOUT_MICROS。
 * 调用者必须将其视为故障闭合（过于复杂），不要路由到旧版解析器。
 */
export const PARSE_ABORTED = Symbol('parse-aborted')

/**
 * 原始解析 — 跳过 ast.ts 中安全遍历器不使用的
 * findCommandNode/extractEnvVars。每个 bash 命令节省一次树遍历。
 *
 * 返回：
 *   - Node：解析成功
 *   - null：模块未加载 / 功能关闭 / 空 / 超长
 *   - PARSE_ABORTED：模块已加载但解析失败（超时/panic）
 */
export async function parseCommandRaw(
  command: string,
): Promise<Node | null | typeof PARSE_ABORTED> {
  if (!command || command.length > MAX_COMMAND_LENGTH) return null
  if (feature('TREE_SITTER_BASH') || feature('TREE_SITTER_BASH_SHADOW')) {
    await ensureParserInitialized()
    const mod = getParserModule()
    logLoadOnce(mod !== null)
    if (!mod) return null
    try {
      const result = mod.parse(command)
      // 安全：模块已加载；此处为 null = bashParser.ts 中
      // 超时/节点预算中止（PARSE_TIMEOUT_MS=50, MAX_NODES=50_000）。
      // 之前坍缩为 `return null` → 解析不可用 → 旧版路径，
      // 该路径缺少 EVAL_LIKE_BUILTINS — `trap`、`enable`、`hash` 泄漏。
      if (result === null) {
        logEvent('tengu_tree_sitter_parse_abort', {
          cmdLength: command.length,
          panic: false,
        })
        return PARSE_ABORTED
      }
      return result
    } catch {
      logEvent('tengu_tree_sitter_parse_abort', {
        cmdLength: command.length,
        panic: true,
      })
      return PARSE_ABORTED
    }
  }
  return null
}

function findCommandNode(node: Node, parent: Node | null): Node | null {
  const { type, children } = node

  if (COMMAND_TYPES.has(type)) return node

  // 变量赋值后跟命令
  if (type === 'variable_assignment' && parent) {
    return (
      parent.children.find(
        c => COMMAND_TYPES.has(c.type) && c.startIndex > node.startIndex,
      ) ?? null
    )
  }

  // 管道：递归进入第一个子节点（可能是一个 redirected_statement）
  if (type === 'pipeline') {
    for (const child of children) {
      const result = findCommandNode(child, node)
      if (result) return result
    }
    return null
  }

  // 重定向语句：查找内部的命令
  if (type === 'redirected_statement') {
    return children.find(c => COMMAND_TYPES.has(c.type)) ?? null
  }

  // 递归搜索
  for (const child of children) {
    const result = findCommandNode(child, node)
    if (result) return result
  }

  return null
}

function extractEnvVars(commandNode: Node | null): string[] {
  if (!commandNode || commandNode.type !== 'command') return []

  const envVars: string[] = []
  for (const child of commandNode.children) {
    if (child.type === 'variable_assignment') {
      envVars.push(child.text)
    } else if (child.type === 'command_name' || child.type === 'word') {
      break
    }
  }
  return envVars
}

export function extractCommandArguments(commandNode: Node): string[] {
  // 声明命令
  if (commandNode.type === 'declaration_command') {
    const firstChild = commandNode.children[0]
    return firstChild && DECLARATION_COMMANDS.has(firstChild.text)
      ? [firstChild.text]
      : []
  }

  const args: string[] = []
  let foundCommandName = false

  for (const child of commandNode.children) {
    if (child.type === 'variable_assignment') continue

    // 命令名称
    if (
      child.type === 'command_name' ||
      (!foundCommandName && child.type === 'word')
    ) {
      foundCommandName = true
      args.push(child.text)
      continue
    }

    // 参数
    if (ARGUMENT_TYPES.has(child.type)) {
      args.push(stripQuotes(child.text))
    } else if (SUBSTITUTION_TYPES.has(child.type)) {
      break
    }
  }
  return args
}

function stripQuotes(text: string): string {
  return text.length >= 2 &&
    ((text[0] === '"' && text.at(-1) === '"') ||
      (text[0] === "'" && text.at(-1) === "'"))
    ? text.slice(1, -1)
    : text
}
