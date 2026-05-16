/**
 * PowerShell 特定的权限检查，改编自 bashPermissions.ts
 * 以实现不区分大小写的 cmdlet 匹配。
 * 此模块实现了完整的 PowerShell 命令权限检查流程，包括安全验证、规则匹配和多层级决策。
 */

import { resolve } from 'path'
import type { ToolPermissionContext, ToolUseContext } from '../../Tool.js'
import type {
  PermissionDecisionReason,
  PermissionResult,
} from '../../types/permissions.js'
import { getCwd } from '../../utils/cwd.js'
import { isCurrentDirectoryBareGitRepo } from '../../utils/git.js'
import type { PermissionRule } from '../../utils/permissions/PermissionRule.js'
import type { PermissionUpdate } from '../../utils/permissions/PermissionUpdateSchema.js'
import {
  createPermissionRequestMessage,
  getRuleByContentsForToolName,
} from '../../utils/permissions/permissions.js'
import {
  matchWildcardPattern,
  parsePermissionRule,
  type ShellPermissionRule,
  suggestionForExactCommand as sharedSuggestionForExactCommand,
} from '../../utils/permissions/shellRuleMatching.js'
import {
  classifyCommandName,
  deriveSecurityFlags,
  getAllCommandNames,
  getFileRedirections,
  type ParsedCommandElement,
  type ParsedPowerShellCommand,
  PS_TOKENIZER_DASH_CHARS,
  parsePowerShellCommand,
  stripModulePrefix,
} from '../../utils/powershell/parser.js'
import { containsVulnerableUncPath } from '../../utils/shell/readOnlyCommandValidation.js'
import { isDotGitPathPS, isGitInternalPathPS } from './gitSafety.js'
import {
  checkPermissionMode,
  isSymlinkCreatingCommand,
} from './modeValidation.js'
import {
  checkPathConstraints,
  dangerousRemovalDeny,
  isDangerousRemovalRawPath,
} from './pathValidation.js'
import { powershellCommandIsSafe } from './powershellSecurity.js'
import {
  argLeaksValue,
  isAllowlistedCommand,
  isCwdChangingCmdlet,
  isProvablySafeStatement,
  isReadOnlyCommand,
  isSafeOutputCommand,
  resolveToCanonical,
} from './readOnlyValidation.js'
import { POWERSHELL_TOOL_NAME } from './toolName.js'

// 匹配 `$var = `, `$var += `, `$env:X = `, `$x ??= ` 等。
// 在解析失败的回退路径中用于剥离嵌套的赋值前缀。
const PS_ASSIGN_PREFIX_RE = /^\$[\w:]+\s*(?:[+\-*/%]|\?\?)?\s*=\s*/

/**
 * 可以将文件放置到调用者指定路径的 cmdlet。
 * git-internal-paths 守卫会检查任何参数是否为 git 内部路径
 * (hooks/, refs/, objects/, HEAD)。非创建性的写入操作 (remove-item,
 * clear-content) 故意未包含在内 — 它们无法植入新的钩子。
 */
const GIT_SAFETY_WRITE_CMDLETS = new Set([
  'new-item',
  'set-content',
  'add-content',
  'out-file',
  'copy-item',
  'move-item',
  'rename-item',
  'expand-archive',
  'invoke-webrequest',
  'invoke-restmethod',
  'tee-object',
  'export-csv',
  'export-clixml',
])

/**
 * 将文件写入 cwd 且路径由归档文件控制的外部解压程序。
 * `tar -xf payload.tar; git status` 会击败 isCurrentDirectoryBareGitRepo (TOCTOU)：
 * 检查在权限评估时运行，tar 在检查之后、git 运行之前提取 HEAD/hooks/refs/。
 * 与 GIT_SAFETY_WRITE_CMDLETS（可以检查参数中的 git 内部路径）不同，
 * 归档内容是未知的 — 任何在 git 之前的解压操作都必须询问。
 * 仅按名称匹配（小写，带或不带 .exe）。
 */
const GIT_SAFETY_ARCHIVE_EXTRACTORS = new Set([
  'tar',
  'tar.exe',
  'bsdtar',
  'bsdtar.exe',
  'unzip',
  'unzip.exe',
  '7z',
  '7z.exe',
  '7za',
  '7za.exe',
  'gzip',
  'gzip.exe',
  'gunzip',
  'gunzip.exe',
  'expand-archive',
])

/**
 * 从 PowerShell 命令字符串中提取命令名称。
 * 使用解析器从 AST 中获取第一个命令名称。
 */
async function extractCommandName(command: string): Promise<string> {
  const trimmed = command.trim()
  if (!trimmed) {
    return ''
  }
  const parsed = await parsePowerShellCommand(trimmed)
  const names = getAllCommandNames(parsed)
  return names[0] ?? ''
}

/**
 * 将权限规则字符串解析为结构化的规则对象。
 * 委托给共享的 parsePermissionRule。
 */
export function powershellPermissionRule(
  permissionRule: string,
): ShellPermissionRule {
  return parsePermissionRule(permissionRule)
}

/**
 * 为精确匹配的命令生成权限更新建议。
 *
 * 对于无法干净往返的命令，跳过精确命令建议：
 * - 多行：换行符无法在标准化后保留，规则永远不会匹配
 * - 字面量 *：将 `Remove-Item * -Force` 原样存储时，会通过 hasWildcards() 重新解析为通配符规则
 *   （匹配 `^Remove-Item .* -Force$`）。转义为 `\*` 会创建一个死规则 — parsePermissionRule 的精确分支
 *   原样返回包含反斜杠的字符串，因此 `Remove-Item \* -Force` 永远无法匹配
 *   传入的 `Remove-Item * -Force`。无论如何，通配符对精确自动允许是不安全的；
 *   仍会提供前缀建议。（发现 #12）
 */
function suggestionForExactCommand(command: string): PermissionUpdate[] {
  if (command.includes('\n') || command.includes('*')) {
    return []
  }
  return sharedSuggestionForExactCommand(POWERSHELL_TOOL_NAME, command)
}

/**
 * PowerShell 输入模式类型 - 初始实现时的简化版本
 */
type PowerShellInput = {
  command: string
  timeout?: number
}

/**
 * 根据与输入命令匹配的内容过滤规则。
 * PowerShell 专用：全程使用不区分大小写的匹配。
 * 遵循与 BashTool 的本地 filterRulesByContentsMatchingInput 相同的结构。
 */
function filterRulesByContentsMatchingInput(
  input: PowerShellInput,
  rules: Map<string, PermissionRule>,
  matchMode: 'exact' | 'prefix',
  behavior: 'deny' | 'ask' | 'allow',
): PermissionRule[] {
  const command = input.command.trim()

  function strEquals(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase()
  }
  function strStartsWith(str: string, prefix: string): boolean {
    return str.toLowerCase().startsWith(prefix.toLowerCase())
  }
  // 安全性：对规则名称使用 stripModulePrefix 会扩展次要规范形式的匹配
  // — 一条拒绝规则 `Module\Remove-Item:*` 能阻止 `rm` 是预期行为（故障安全的过度匹配），
  // 但一条允许规则 `ModuleA\Get-Thing:*` 也匹配 `ModuleB\Get-Thing` 则是故障开放的。
  // 拒绝/询问的过度匹配是可以的；允许绝不能过度匹配。
  function stripModulePrefixForRule(name: string): string {
    if (behavior === 'allow') {
      return name
    }
    return stripModulePrefix(name)
  }

  // 从输入中提取第一个单词（命令名称）用于规范形式匹配。
  // 保留原始版本（用于切割原始的 `command` 字符串）和剥离版本
  // （用于规范形式解析）。对于如
  // `Microsoft.PowerShell.Utility\Invoke-Expression foo` 的模块限定输入，rawCmdName 保存完整标记，
  // 因此 `command.slice(rawCmdName.length)` 能产生正确的剩余部分。
  const rawCmdName = command.split(/\s+/)[0] ?? ''
  const inputCmdName = stripModulePrefix(rawCmdName)
  const inputCanonical = resolveToCanonical(inputCmdName)

  // 构建一个命令的规范名称替换版本
  // 例如，'rm foo.txt' -> 'remove-item foo.txt'，以便 Remove-Item 上的拒绝规则也能阻止 rm。
  // 安全性：将名称和参数之间的空白分隔符标准化为单个空格。PowerShell 接受任意空白符（制表符等）作为分隔符，
  // 但前缀规则匹配使用 `prefix + ' '`（字面空格）。如果不这样处理，
  // `rm\t./x` 规范化为 `remove-item\t./x` 就会错过拒绝规则
  // `Remove-Item:*`，而 acceptEdits 自动允许（使用 AST cmd.name）仍然匹配
  // — 一个拒绝规则绕过。无条件构建（而不仅当规范形式不同时）以便原始的非空格分隔命令也被标准化。
  const rest = command.slice(rawCmdName.length).replace(/^\s+/, ' ')
  const canonicalCommand = inputCanonical + rest

  return Array.from(rules.entries())
    .filter(([ruleContent]) => {
      const rule = powershellPermissionRule(ruleContent)

      // 同时将规则的命令名称解析为规范形式以便交叉匹配
      // 例如，针对 'rm' 的拒绝规则也应该阻止 'Remove-Item'
      function matchesCommand(cmd: string): boolean {
        switch (rule.type) {
          case 'exact':
            return strEquals(rule.command, cmd)
          case 'prefix':
            switch (matchMode) {
              case 'exact':
                return strEquals(rule.prefix, cmd)
              case 'prefix': {
                if (strEquals(cmd, rule.prefix)) {
                  return true
                }
                return strStartsWith(cmd, rule.prefix + ' ')
              }
            }
            break
          case 'wildcard':
            if (matchMode === 'exact') {
              return false
            }
            return matchWildcardPattern(rule.pattern, cmd, true)
        }
      }

      // 检查原始命令
      if (matchesCommand(command)) {
        return true
      }

      // 同时检查命令的规范形式
      // 这确保了 'deny Remove-Item' 也能阻止 'rm', 'del', 'ri' 等。
      if (matchesCommand(canonicalCommand)) {
        return true
      }

      // 同时将规则的命令名称解析为规范形式并比较
      // 这确保了 'deny rm' 也能阻止 'Remove-Item'
      // 安全性：stripModulePrefix 也应用于拒绝/询问规则的命令名称，而不仅仅是输入。
      // 否则，写为 `Microsoft.PowerShell.Management\Remove-Item:*` 的拒绝规则会被 `rm`、
      // `del` 或普通的 `Remove-Item` 绕过 — resolveToCanonical 不会将模块限定形式与 COMMON_ALIASES 匹配。
      if (rule.type === 'exact') {
        const rawRuleCmdName = rule.command.split(/\s+/)[0] ?? ''
        const ruleCanonical = resolveToCanonical(
          stripModulePrefixForRule(rawRuleCmdName),
        )
        if (ruleCanonical === inputCanonical) {
          // 规则和输入解析为相同的规范 cmdlet
          // 安全性：使用标准化的 `rest` 而不是从 `command` 重新切片。
          // 原始切片保留了制表符分隔符，因此
          // `Remove-Item\t./secret.txt` 与拒绝规则 `rm ./secret.txt` 会错过匹配。
          // 两边使用相同的标准化。
          const ruleRest = rule.command
            .slice(rawRuleCmdName.length)
            .replace(/^\s+/, ' ')
          const inputRest = rest
          if (strEquals(ruleRest, inputRest)) {
            return true
          }
        }
      } else if (rule.type === 'prefix') {
        const rawRuleCmdName = rule.prefix.split(/\s+/)[0] ?? ''
        const ruleCanonical = resolveToCanonical(
          stripModulePrefixForRule(rawRuleCmdName),
        )
        if (ruleCanonical === inputCanonical) {
          const ruleRest = rule.prefix
            .slice(rawRuleCmdName.length)
            .replace(/^\s+/, ' ')
          const canonicalPrefix = inputCanonical + ruleRest
          if (matchMode === 'exact') {
            if (strEquals(canonicalPrefix, canonicalCommand)) {
              return true
            }
          } else {
            if (
              strEquals(canonicalCommand, canonicalPrefix) ||
              strStartsWith(canonicalCommand, canonicalPrefix + ' ')
            ) {
              return true
            }
          }
        }
      } else if (rule.type === 'wildcard') {
        // 将通配符模式的命令名称解析为规范形式并重新匹配
        // 这确保了 'deny rm *' 也能阻止 'Remove-Item secret.txt'
        const rawRuleCmdName = rule.pattern.split(/\s+/)[0] ?? ''
        const ruleCanonical = resolveToCanonical(
          stripModulePrefixForRule(rawRuleCmdName),
        )
        if (ruleCanonical === inputCanonical && matchMode !== 'exact') {
          // 使用规范 cmdlet 名称重建模式
          // 与精确和前缀分支一样标准化分隔符。
          // 否则，通配符规则 `rm\t*` 会生成一个包含字面制表符的 canonicalPattern，
          // 永远无法匹配以空格标准化的 canonicalCommand。
          const ruleRest = rule.pattern
            .slice(rawRuleCmdName.length)
            .replace(/^\s+/, ' ')
          const canonicalPattern = inputCanonical + ruleRest
          if (matchWildcardPattern(canonicalPattern, canonicalCommand, true)) {
            return true
          }
        }
      }

      return false
    })
    .map(([, rule]) => rule)
}

/**
 * 获取所有规则类型（拒绝、询问、允许）中与输入匹配的规则
 */
function matchingRulesForInput(
  input: PowerShellInput,
  toolPermissionContext: ToolPermissionContext,
  matchMode: 'exact' | 'prefix',
) {
  const denyRuleByContents = getRuleByContentsForToolName(
    toolPermissionContext,
    POWERSHELL_TOOL_NAME,
    'deny',
  )
  const matchingDenyRules = filterRulesByContentsMatchingInput(
    input,
    denyRuleByContents,
    matchMode,
    'deny',
  )

  const askRuleByContents = getRuleByContentsForToolName(
    toolPermissionContext,
    POWERSHELL_TOOL_NAME,
    'ask',
  )
  const matchingAskRules = filterRulesByContentsMatchingInput(
    input,
    askRuleByContents,
    matchMode,
    'ask',
  )

  const allowRuleByContents = getRuleByContentsForToolName(
    toolPermissionContext,
    POWERSHELL_TOOL_NAME,
    'allow',
  )
  const matchingAllowRules = filterRulesByContentsMatchingInput(
    input,
    allowRuleByContents,
    matchMode,
    'allow',
  )

  return { matchingDenyRules, matchingAskRules, matchingAllowRules }
}

/**
 * 检查命令是否精确匹配某条权限规则。
 */
export function powershellToolCheckExactMatchPermission(
  input: PowerShellInput,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  // DOGE: 防御性检查 —— input 或 command 无效时放行
  if (!input || typeof input.command !== 'string' || !input.command.trim()) {
    return {
      behavior: 'passthrough',
      message: '命令输入为空，跳过精确匹配权限检查',
    }
  }
  const trimmedCommand = input.command.trim()
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } =
    matchingRulesForInput(input, toolPermissionContext, 'exact')

  if (matchingDenyRules[0] !== undefined) {
    return {
      behavior: 'deny',
      message: `使用命令 ${trimmedCommand} 执行 ${POWERSHELL_TOOL_NAME} 的权限已被拒绝。`,
      decisionReason: { type: 'rule', rule: matchingDenyRules[0] },
    }
  }

  if (matchingAskRules[0] !== undefined) {
    return {
      behavior: 'ask',
      message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
      decisionReason: { type: 'rule', rule: matchingAskRules[0] },
    }
  }

  if (matchingAllowRules[0] !== undefined) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: { type: 'rule', rule: matchingAllowRules[0] },
    }
  }

  const decisionReason: PermissionDecisionReason = {
    type: 'other' as const,
    reason: '此命令需要批准',
  }
  return {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(
      POWERSHELL_TOOL_NAME,
      decisionReason,
    ),
    decisionReason,
    suggestions: suggestionForExactCommand(trimmedCommand),
  }
}

/**
 * 检查 PowerShell 命令的权限，包括前缀匹配。
 */
export function powershellToolCheckPermission(
  input: PowerShellInput,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  // DOGE: 防御性检查 —— input 或 command 无效时放行
  if (!input || typeof input.command !== 'string' || !input.command.trim()) {
    return {
      behavior: 'allow',
      message: '命令输入为空，跳过权限检查',
    }
  }
  const command = input.command.trim()

  // 1. 首先检查精确匹配
  const exactMatchResult = powershellToolCheckExactMatchPermission(
    input,
    toolPermissionContext,
  )

  // 1a. 如果精确命令有规则则拒绝/询问
  if (
    exactMatchResult.behavior === 'deny' ||
    exactMatchResult.behavior === 'ask'
  ) {
    return exactMatchResult
  }

  // 2. 查找所有匹配的规则（前缀或精确）
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } =
    matchingRulesForInput(input, toolPermissionContext, 'prefix')

  // 2a. 如果命令有拒绝规则则拒绝
  if (matchingDenyRules[0] !== undefined) {
    return {
      behavior: 'deny',
      message: `使用命令 ${command} 执行 ${POWERSHELL_TOOL_NAME} 的权限已被拒绝。`,
      decisionReason: {
        type: 'rule',
        rule: matchingDenyRules[0],
      },
    }
  }

  // 2b. 如果命令有询问规则则询问
  if (matchingAskRules[0] !== undefined) {
    return {
      behavior: 'ask',
      message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
      decisionReason: {
        type: 'rule',
        rule: matchingAskRules[0],
      },
    }
  }

  // 3. 如果命令有精确匹配的允许规则则允许
  if (exactMatchResult.behavior === 'allow') {
    return exactMatchResult
  }

  // 4. 如果命令有允许规则则允许
  if (matchingAllowRules[0] !== undefined) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'rule',
        rule: matchingAllowRules[0],
      },
    }
  }

  // 5. 无规则匹配，传递以触发权限提示
  const decisionReason = {
    type: 'other' as const,
    reason: '此命令需要批准',
  }
  return {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(
      POWERSHELL_TOOL_NAME,
      decisionReason,
    ),
    decisionReason,
    suggestions: suggestionForExactCommand(command),
  }
}

/**
 * 用于权限检查的子命令信息。
 */
type SubCommandInfo = {
  text: string
  element: ParsedCommandElement
  statement: ParsedPowerShellCommand['statements'][number] | null
  isSafeOutput: boolean
}

/**
 * 从解析后的命令中提取需要独立权限检查的子命令。
 * 安全的输出 cmdlet（Format-Table、Select-Object 等）被标记但不会被过滤掉
 * — 步骤 4.4 仍会检查针对它们的拒绝规则（拒绝总是胜出），
 * 步骤 5 在收集批准时会跳过它们（它们继承前一个命令的权限）。
 *
 * 同时包含控制流语句（if、for、foreach 等）中的嵌套命令，
 * 以确保隐藏在控制流中的命令也被检查。
 *
 * 返回子命令信息，包括文本和解析后的元素，以便准确生成建议。
 */
async function getSubCommandsForPermissionCheck(
  parsed: ParsedPowerShellCommand,
  originalCommand: string,
): Promise<SubCommandInfo[]> {
  if (!parsed.valid) {
    // 为未解析的命令返回一个回退元素
    return [
      {
        text: originalCommand,
        element: {
          name: await extractCommandName(originalCommand),
          nameType: 'unknown',
          elementType: 'CommandAst',
          args: [],
          text: originalCommand,
        },
        statement: null,
        isSafeOutput: false,
      },
    ]
  }

  const subCommands: SubCommandInfo[] = []

  // 检查管道中的直接命令
  for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      // 仅检查实际命令 (CommandAst)，而非表达式
      if (cmd.elementType !== 'CommandAst') {
        continue
      }
      subCommands.push({
        text: cmd.text,
        element: cmd,
        statement,
        // 安全性：nameType 门禁 — scripts\\Out-Null 剥离后变为 Out-Null，
        // 会匹配 SAFE_OUTPUT_CMDLETS，但 PowerShell 会运行 .ps1 文件。
        // isSafeOutput: true 会导致步骤 5 将此命令从批准列表中过滤掉，
        // 从而悄悄执行。参见 isAllowlistedCommand。
        // 安全性：args.length === 0 门禁 — Out-Null -InputObject:(1 > /etc/x)
        // 曾被视为安全输出（仅名称匹配）→ 步骤 5 的 subCommands 为空 →
        // 自动允许 → 括号内的重定向会写入文件。仅零参数的
        // Out-String/Out-Null/Out-Host 调用是经证明安全的。
        isSafeOutput:
          cmd.nameType !== 'application' &&
          isSafeOutputCommand(cmd.name) &&
          cmd.args.length === 0,
      })
    }

    // 同时检查控制流语句中的嵌套命令
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        subCommands.push({
          text: cmd.text,
          element: cmd,
          statement,
          isSafeOutput:
            cmd.nameType !== 'application' &&
            isSafeOutputCommand(cmd.name) &&
            cmd.args.length === 0,
        })
      }
    }
  }

  if (subCommands.length > 0) {
    return subCommands
  }

  // 没有子命令时的回退
  return [
    {
      text: originalCommand,
      element: {
        name: await extractCommandName(originalCommand),
        nameType: 'unknown',
        elementType: 'CommandAst',
        args: [],
        text: originalCommand,
      },
      statement: null,
      isSafeOutput: false,
    },
  ]
}

/**
 * PowerShell 工具的主要权限检查函数。
 *
 * 此函数实现完整的权限流程：
 * 1. 检查与拒绝/询问/允许规则的精确匹配
 * 2. 检查与规则的前缀匹配
 * 3. 通过 powershellCommandIsSafe() 运行安全检查
 * 4. 返回适当的 PermissionResult
 *
 * @param input - PowerShell 工具输入
 * @param context - 工具使用上下文（用于中止信号和会话信息）
 * @returns 解析为 PermissionResult 的 Promise
 */
export async function powershellToolHasPermission(
  input: PowerShellInput,
  context: ToolUseContext,
): Promise<PermissionResult> {
  // DOGE: 防御性检查 —— input 或 input.command 无效时直接放行（防止 REPL 崩溃）
  if (!input || typeof input.command !== 'string') {
    return {
      behavior: 'allow',
      message: '命令输入为空，跳过权限检查',
    }
  }
  const toolPermissionContext = context.getAppState().toolPermissionContext
  const command = input.command.trim()

  // 空命令检查
  if (!command) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: '空命令是安全的',
      },
    }
  }

  // 解析命令一次，并传递给所有子函数
  const parsed = await parsePowerShellCommand(command)

  // 安全性：在检查解析有效性之前检查拒绝/询问规则。
  // 拒绝规则操作原始命令字符串，不需要解析后的 AST。
  // 这确保了即使解析失败，显式拒绝规则仍会阻止命令。
  // 1. 首先检查精确匹配
  const exactMatchResult = powershellToolCheckExactMatchPermission(
    input,
    toolPermissionContext,
  )

  // 精确命令被拒绝
  if (exactMatchResult.behavior === 'deny') {
    return exactMatchResult
  }

  // 2. 检查前缀/通配符规则
  const { matchingDenyRules, matchingAskRules } = matchingRulesForInput(
    input,
    toolPermissionContext,
    'prefix',
  )

  // 2a. 如果命令有拒绝规则则拒绝
  if (matchingDenyRules[0] !== undefined) {
    return {
      behavior: 'deny',
      message: `使用命令 ${command} 执行 ${POWERSHELL_TOOL_NAME} 的权限已被拒绝。`,
      decisionReason: {
        type: 'rule',
        rule: matchingDenyRules[0],
      },
    }
  }

  // 2b. 如果命令有询问规则则询问 — 延迟加入 decisions[]。
  // 之前这里会提前返回，导致子命令拒绝检查无法运行。因此
  // `Get-Process; Invoke-Expression evil` 在有 ask(Get-Process:*) +
  // deny(Invoke-Expression:*) 的情况下会显示询问对话框而拒绝规则永远不会触发。
  // 现在：存储询问，在解析成功后推入 decisions[]。
  // 如果解析失败，则在解析错误询问前返回（当 pwsh 不可用时保留规则属性的 decisionReason）。
  let preParseAskDecision: PermissionResult | null = null
  if (matchingAskRules[0] !== undefined) {
    preParseAskDecision = {
      behavior: 'ask',
      message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
      decisionReason: {
        type: 'rule',
        rule: matchingAskRules[0],
      },
    }
  }

  // 阻止 UNC 路径 — 从 UNC 路径读取可能触发网络请求
  // 并泄漏 NTLM/Kerberos 凭据。延迟加入 decisions[]。
  // 原始字符串 UNC 检查不能在子命令拒绝（步骤 4+）之前提前返回。
  // 与上面的 2b 相同修复。
  if (preParseAskDecision === null && containsVulnerableUncPath(command)) {
    preParseAskDecision = {
      behavior: 'ask',
      message: '命令包含可能触发网络请求的 UNC 路径',
    }
  }

  // 2c. 精确允许规则仅当解析失败且没有待处理的预解析询问（2b 前缀或 UNC）时才在此处短路。
  // 将 2b/UNC 从提前返回改为延迟赋值意味着 2c 会在 L648 消费 preParseAskDecision 之前触发，
  // 悄悄用允许覆盖询问。解析成功的路径通过 reduce 强制执行 ask > allow (L917)；
  // 没有此守卫，解析失败的情况会不一致。
  // 这确保了即使 pwsh 不可用，用户配置的精确允许规则也能工作。当解析成功时，精确允许检查推迟到步骤 4.4（子命令拒绝/询问）之后
  // — 与 BashTool 的顺序一致，其中 bashPermissions.ts:1520 的主流程精确允许在子命令拒绝检查（1442-1458）之后运行。
  // 否则，对复合命令的精确允许会绕过对子命令的拒绝规则。
  //
  // 安全性（解析失败分支）：步骤 5 中的 nameType 守卫存在于子命令循环内部，
  // 该循环仅在 parsed.valid 时运行。这是 !parsed.valid 的逃生舱口。
  // 输入侧的 stripModulePrefix 是无条件的 — `scripts\\build.exe --flag` 剥离为 `build.exe`，
  // canonicalCommand 匹配精确允许，而没有此守卫我们会在此处返回允许并执行本地脚本。
  // classifyCommandName 是纯字符串函数（无需 AST）。`scripts\\build.exe` → 'application'（有 `\`）。
  // 与步骤 5 相同的权衡：`build.exe` 单独也会分类为 'application'（有 `.`），因此合法的可执行文件精确允许在 pwsh 降级时会被降级为询问 — 故障安全。
  // 模块限定的 cmdlet (Module\Cmdlet) 也会分类为 'application'（同样的 `\`）；相同的故障安全过度触发。
  if (
    exactMatchResult.behavior === 'allow' &&
    !parsed.valid &&
    preParseAskDecision === null &&
    classifyCommandName(command.split(/\s+/)[0] ?? '') !== 'application'
  ) {
    return exactMatchResult
  }

  // 0. 检查命令是否可解析 - 如果不能，需要批准但不建议持久化
  // 这与 Bash 行为一致：无效语法会触发权限提示，但我们不建议将无效命令保存到设置中
  // 注意：此检查有意放在拒绝/询问规则之后，以便即使解析器失败（例如 pwsh 不可用），显式规则仍然有效。
  if (!parsed.valid) {
    // 安全性：解析失败路径的回退子命令拒绝扫描。
    // L851+ 的子命令拒绝循环需要 AST；当解析失败时
    // （命令超出 MAX_COMMAND_LENGTH、pwsh 不可用、超时、错误的 JSON），
    // 我们会返回 'ask' 而从未检查子命令拒绝规则。
    // 攻击：`Get-ChildItem # <~2000 chars padding> ; Invoke-Expression evil`
    // → 填充迫使 valid=false → 通用询问提示，deny(iex:*) 从不触发。
    // 此回退根据 PowerShell 分隔符/分组进行分割，并将每个片段通过相同的规则匹配器（步骤 2a 前缀拒绝）运行。
    // 保守：字符串字面量/注释内的片段可能会误报拒绝 — 此处安全（解析失败已经是降级状态，且这是拒绝降级修复）。
    // 匹配完整片段（不仅仅是第一个标记），以便多词规则如 `Remove-Item foo:*` 仍能触发；匹配器的规范解析处理别名（`iex` → `Invoke-Expression`）。
    //
    // 安全性：反引号是 PS 的转义/续行符，不是分隔符。
    // 按反引号分割会将 `Invoke-Ex`pression` 分解为不匹配的部分。
    // 替代方案：折叠反引号换行（续行），以便 `Invoke-Ex`<nl>pression` 重新连接，剥离其余反引号（转义字符 — ``x → x），
    // 然后按实际的语句/分组分隔符分割。
    const backtickStripped = command
      .replace(/`[\r\n]+\s*/g, '')
      .replace(/`/g, '')
    for (const fragment of backtickStripped.split(/[;|\n\r{}()&]+/)) {
      const trimmedFrag = fragment.trim()
      if (!trimmedFrag) continue // 跳过空片段
      // 仅当完整命令以 cmdlet 名称开头（无赋值前缀）时才跳过。
      // 完整命令已在 2a 检查过，但 2a 使用原始文本 — 作为第一个标记的 `$x %= iex` 会错过 deny(iex:*) 规则。
      // 如果标准化会改变片段（赋值前缀、点源），则不要跳过 — 让它在标准化后重新检查。（缺陷 #10/#24）
      if (
        trimmedFrag === command &&
        !/^\$[\w:]/.test(trimmedFrag) &&
        !/^[&.]\s/.test(trimmedFrag)
      ) {
        continue
      }
      // 安全性：在规则匹配之前标准化调用操作符和赋值前缀（发现 #5/#22）。
      // 分割器给我们原始片段文本；matchingRulesForInput 提取第一个标记作为 cmdlet 名称。
      // 如果不标准化：
      //   `$x = Invoke-Expression 'p'` → 第一个标记 `$x` → deny(iex:*) 错过
      //   `. Invoke-Expression 'p'`    → 第一个标记 `.`  → deny(iex:*) 错过
      //   `& 'Invoke-Expression' 'p'`  → 第一个标记 `&` 被分割移除，但 `'Invoke-Expression'` 保留引号 → deny(iex:*) 错过
      // 解析成功的路径通过 AST 处理这些（parser.ts:839 从 rawNameUnstripped 剥离引号；调用操作符是单独的 AST 节点）。
      // 此回退镜像了该标准化。
      // 循环剥离嵌套赋值：$x = $y = iex → $y = iex → iex
      let normalized = trimmedFrag
      let m: RegExpMatchArray | null
      while ((m = normalized.match(PS_ASSIGN_PREFIX_RE))) {
        normalized = normalized.slice(m[0].length)
      }
      normalized = normalized.replace(/^[&.]\s+/, '') // & cmd, . cmd (点源)
      const rawFirst = normalized.split(/\s+/)[0] ?? ''
      const firstTok = rawFirst.replace(/^['"]|['"]$/g, '')
      const normalizedFrag = firstTok + normalized.slice(rawFirst.length)
      // 安全性：解析独立的危险删除硬拒绝。checkPathConstraintsForStatement 中的 isDangerousRemovalPath 检查
      // 需要有效的 AST；当 pwsh 超时或不可用时，`Remove-Item /` 会从硬拒绝降级为通用询问。
      // 在此检查原始位置参数，以便无论解析器是否可用，根目录/家目录/系统删除都被拒绝。
      // 保守：仅位置参数（跳过 -Param 标记）；在降级状态下过度拒绝是安全的
      // （与上面的子命令扫描相同的拒绝降级理由）。
      if (resolveToCanonical(firstTok) === 'remove-item') {
        for (const arg of normalized.split(/\s+/).slice(1)) {
          if (PS_TOKENIZER_DASH_CHARS.has(arg[0] ?? '')) continue
          if (isDangerousRemovalRawPath(arg)) {
            return dangerousRemovalDeny(arg)
          }
        }
      }
      const { matchingDenyRules: fragDenyRules } = matchingRulesForInput(
        { command: normalizedFrag },
        toolPermissionContext,
        'prefix',
      )
      if (fragDenyRules[0] !== undefined) {
        return {
          behavior: 'deny',
          message: `使用命令 ${command} 执行 ${POWERSHELL_TOOL_NAME} 的权限已被拒绝。`,
          decisionReason: { type: 'rule', rule: fragDenyRules[0] },
        }
      }
    }
    // 当解析失败时保留预解析询问消息。延迟的询问（2b 前缀规则或 UNC）
    // 比通用的解析错误询问携带更好的 decisionReason。子命令拒绝无法在没有解析的情况下运行 AST 循环，
    // 因此上面的回退扫描是尽力而为的。
    if (preParseAskDecision !== null) {
      return preParseAskDecision
    }
    const decisionReason = {
      type: 'other' as const,
      reason: `命令包含无法解析的畸形语法: ${parsed.errors[0]?.message ?? '未知错误'}`,
    }
    return {
      behavior: 'ask',
      decisionReason,
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason,
      ),
      // 没有建议 - 不建议持久化无效语法
    }
  }

  // ========================================================================
  // 收集然后归约：解析后的决策（拒绝 > 询问 > 允许 > 传递）
  // ========================================================================
  // 移植自 bashPermissions.ts:1446-1472。每个解析后检查将其决策推入一个单一数组；
  // 单次归约应用优先级。这在结构上关闭了询问先于拒绝的错误类别：
  // 早期检查（安全标志、提供程序路径、cd+git）的 'ask' 无法再掩盖
  // 后期检查（子命令拒绝、checkPathConstraints）的 'deny'。
  //
  // 取代了提交 8f5ae6c56b 中的 firstSubCommandAskRule 暂存 — 该修复仅修补了步骤 4；
  // 步骤 3、3.5、4.42 存在同样的缺陷。暂存模式也很脆弱：下一个编写 `return ask` 的人
  // 会回到原点。收集-然后-归约使绕过不可能编写。
  //
  // 每种行为的第一个胜出（数组顺序 = 步骤顺序），因此单检查的询问消息与顺序提前返回相同。
  //
  // 预解析拒绝检查（精确/前缀拒绝）保持顺序：它们在 pwsh 不可用时仍会触发。
  // 预解析询问（前缀询问、原始 UNC）现在延迟至此，以便子命令拒绝（步骤 4）胜过它们。

  // 收集一次子命令（用于决策 3、4 和回退步骤 5）。
  const allSubCommands = await getSubCommandsForPermissionCheck(parsed, command)

  const decisions: PermissionResult[] = []

  // 决策：延迟的预解析询问（2b 前缀询问或 UNC 路径）。
  // 首先推入，以便其消息胜过后续的询问（每种行为的第一个胜出），
  // 但归约确保 decisions[] 中的任何拒绝仍胜过它。
  if (preParseAskDecision !== null) {
    decisions.push(preParseAskDecision)
  }

  // 决策：安全检查 — 原步骤 3 (:630-650)。
  // powershellCommandIsSafe 对子表达式、脚本块、编码命令、下载摇篮等返回 'ask'。
  // 仅 'ask' | 'passthrough'。
  const safetyResult = powershellCommandIsSafe(command, parsed)
  if (safetyResult.behavior !== 'passthrough') {
    const decisionReason: PermissionDecisionReason = {
      type: 'other' as const,
      reason:
        safetyResult.behavior === 'ask' && safetyResult.message
          ? safetyResult.message
          : '此命令包含可能带来安全风险的模式，需要批准',
    }
    decisions.push({
      behavior: 'ask',
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason,
      ),
      decisionReason,
      suggestions: suggestionForExactCommand(command),
    })
  }

  // 决策：using 语句 / 脚本要求 — AST 块遍历看不见。
  // `using module ./evil.psm1` 加载并执行模块的顶级脚本体；
  // `using assembly ./evil.dll` 加载 .NET 程序集（模块初始化器运行）。
  // `#Requires -Modules <name>` 触发从 PSModulePath 加载模块。
  // 这些是 ScriptBlockAst 上与命名块并列的兄弟节点，而不是子节点，因此
  // Process-BlockStatements 和所有下游命令遍历器都看不见它们。
  // 没有此检查，像 Get-Process 这样的诱饵 cmdlet 填充 subCommands，
  // 绕过空语句回退，而 isReadOnlyCommand 自动允许。
  if (parsed.hasUsingStatements) {
    const decisionReason: PermissionDecisionReason = {
      type: 'other' as const,
      reason: '命令包含可能加载外部代码（模块或程序集）的 `using` 语句',
    }
    decisions.push({
      behavior: 'ask',
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason,
      ),
      decisionReason,
      suggestions: suggestionForExactCommand(command),
    })
  }
  if (parsed.hasScriptRequirements) {
    const decisionReason: PermissionDecisionReason = {
      type: 'other' as const,
      reason: '命令包含可能触发模块加载的 `#Requires` 指令',
    }
    decisions.push({
      behavior: 'ask',
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason,
      ),
      decisionReason,
      suggestions: suggestionForExactCommand(command),
    })
  }

  // 决策：解析后的参数提供程序/UNC 扫描 — 原步骤 3.5 (:652-709)。
  // 提供程序路径（env:, HKLM:, function:）访问非文件系统资源。
  // UNC 路径在 Windows 上可能泄漏 NTLM/Kerberos 凭据。上面的原始字符串 UNC 检查
  // （预解析）遗漏了反引号转义的形式；cmd.args 中解析器已解析反引号转义。
  // 带标签的循环在第一个匹配时中断（与之前的提前返回相同）。
  // 提供程序前缀同时匹配短格式（`env:`、`HKLM:`）和完全限定格式（`Microsoft.PowerShell.Core\Registry::HKLM\...`）。
  // 可选的 `(?:[\w.]+\\)?` 处理模块限定前缀；`::?` 匹配单冒号驱动器语法或双冒号提供程序语法。
  const NON_FS_PROVIDER_PATTERN =
    /^(?:[\w.]+\\)?(env|hklm|hkcu|function|alias|variable|cert|wsman|registry)::?/i
  function extractProviderPathFromArg(arg: string): string {
    // 处理冒号参数语法：-Path:env:HOME → 提取 'env:HOME'。
    // 安全性：PowerShell 的分词器接受 en-dash/em-dash/horizontal-bar
    // (U+2013/2014/2015) 作为参数前缀。`–Path:env:HOME`（en-dash）
    // 也必须剥离 `–Path:` 前缀，否则 NON_FS_PROVIDER_PATTERN 无法匹配（模式是 `^(env|...):`，在 `–Path:env:...` 上失败）。
    let s = arg
    if (s.length > 0 && PS_TOKENIZER_DASH_CHARS.has(s[0]!)) {
      const colonIdx = s.indexOf(':', 1) // 跳过前导破折号
      if (colonIdx > 0) {
        s = s.substring(colonIdx + 1)
      }
    }
    // 在匹配前剥离反引号转义：`Registry`::HKLM\...` 在 `::` 前有一个反引号，
    // PS 分词器在运行时会移除它，但否则会阻止 ^ 锚定的模式匹配。
    return s.replace(/`/g, '')
  }
  function providerOrUncDecisionForArg(arg: string): PermissionResult | null {
    const value = extractProviderPathFromArg(arg)
    if (NON_FS_PROVIDER_PATTERN.test(value)) {
      return {
        behavior: 'ask',
        message: `命令参数 '${arg}' 使用了非文件系统提供程序路径，需要批准`,
      }
    }
    if (containsVulnerableUncPath(value)) {
      return {
        behavior: 'ask',
        message: `命令参数 '${arg}' 包含可能触发网络请求的 UNC 路径`,
      }
    }
    return null
  }
  providerScan: for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      if (cmd.elementType !== 'CommandAst') continue
      for (const arg of cmd.args) {
        const decision = providerOrUncDecisionForArg(arg)
        if (decision !== null) {
          decisions.push(decision)
          break providerScan
        }
      }
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        for (const arg of cmd.args) {
          const decision = providerOrUncDecisionForArg(arg)
          if (decision !== null) {
            decisions.push(decision)
            break providerScan
          }
        }
      }
    }
  }

  // 决策：每个子命令的拒绝/询问规则 — 原步骤 4 (:711-803)。
  // 每个子命令最多产生一个决策（拒绝或询问）。后续子命令上的拒绝规则
  // 仍通过归约胜过先前子命令上的询问规则。
  // 不需要暂存 — 归约在结构上强制执行拒绝 > 询问。
  //
  // 安全性：始终从 AST 派生的数据（element.name + 空格连接的参数）构建规范命令字符串，
  // 并同样检查规则。拒绝和允许必须使用相同的标准化形式以消除不对称：
  //   - 调用操作符（`& 'Remove-Item' ./x`）：原始文本以 `&` 开头，
  //     按空格分割产生操作符，而非 cmdlet 名称。
  //   - 非空格空白符（`rm\t./x`）：原始前缀匹配使用 `prefix + ' '`（字面空格），
  //     但 PowerShell 接受任何空白符作为分隔符。
  //     checkPermissionMode 自动允许（使用 AST cmd.name）会匹配，
  //     而对原始文本的拒绝规则匹配会错过 — 一个拒绝规则绕过。
  //   - 模块前缀（`Microsoft.PowerShell.Management\Remove-Item`）：
  //     element.name 已剥离模块前缀。
  for (const { text: subCmd, element } of allSubCommands) {
    // element.name 在解析器 (transformCommandAst) 处已剥离引号，
    // 因此 `& 'Invoke-Expression' 'x'` 产生 name='Invoke-Expression'，
    // 而不是 "'Invoke-Expression'"。canonicalSubCmd 从相同的剥离名称构建，
    // 因此对 `Invoke-Expression:*` 的拒绝规则前缀匹配会命中。
    const canonicalSubCmd =
      element.name !== '' ? [element.name, ...element.args].join(' ') : null

    const subInput = { command: subCmd }
    const { matchingDenyRules: subDenyRules, matchingAskRules: subAskRules } =
      matchingRulesForInput(subInput, toolPermissionContext, 'prefix')
    let matchedDenyRule = subDenyRules[0]
    let matchedAskRule = subAskRules[0]

    if (matchedDenyRule === undefined && canonicalSubCmd !== null) {
      const {
        matchingDenyRules: canonicalDenyRules,
        matchingAskRules: canonicalAskRules,
      } = matchingRulesForInput(
        { command: canonicalSubCmd },
        toolPermissionContext,
        'prefix',
      )
      matchedDenyRule = canonicalDenyRules[0]
      if (matchedAskRule === undefined) {
        matchedAskRule = canonicalAskRules[0]
      }
    }

    if (matchedDenyRule !== undefined) {
      decisions.push({
        behavior: 'deny',
        message: `使用命令 ${command} 执行 ${POWERSHELL_TOOL_NAME} 的权限已被拒绝。`,
        decisionReason: {
          type: 'rule',
          rule: matchedDenyRule,
        },
      })
    } else if (matchedAskRule !== undefined) {
      decisions.push({
        behavior: 'ask',
        message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
        decisionReason: {
          type: 'rule',
          rule: matchedAskRule,
        },
      })
    }
  }

  // 决策：cd+git 复合守卫 — 原步骤 4.42 (:805-833)。
  // 当 cd/Set-Location 与 git 配对时，未经提示不允许执行 —
  // 切换到恶意目录会使 git 变得危险（伪造钩子、裸仓库攻击）。
  // 收集-然后-归约保持了相对于 BashTool 的改进：在 bash 中，
  // cd+git (B9, 行 1416) 在子命令拒绝 (B11) 之前运行，因此 cd+git 询问会掩盖拒绝。
  // 此处，两者在同一决策数组中；拒绝胜出。
  //
  // 安全性：没有 cd-to-CWD 空操作排除。之前的迭代将
  // `Set-Location .` 排除为空操作，但用于提取目标路径的“第一个非破折号参数”启发式方法
  // 被冒号绑定的参数愚弄：`Set-Location -Path:/etc .` — 真实目标是 /etc，启发式看到 `.`，
  // 排除触发，绕过。UX 情况（模型发出 `Set-Location .; foo`）罕见；
  // 不值得为特殊情况冒攻击风险。复合命令中的任何 cd 系列 cmdlet 都会设置此标志。
  // 仅当有多个子命令时才标记复合 cd。单独的 `Set-Location ./subdir` 不是 TOCTOU 风险
  // （没有后续语句在过时的 cwd 上解析相对路径）。否则，单独的 cd 会强制复合守卫，
  // 抑制每个子命令的自动允许路径。（缺陷 #25）
  const hasCdSubCommand =
    allSubCommands.length > 1 &&
    allSubCommands.some(({ element }) => isCwdChangingCmdlet(element.name))
  // 符号链接创建复合守卫（发现 #18 / 缺陷 001+004）：当复合命令创建文件系统链接时，
  // 后续通过该链接的写入会落在验证器视图之外。与 cwd 不同步相同的 TOCTOU 形式。
  const hasSymlinkCreate =
    allSubCommands.length > 1 &&
    allSubCommands.some(({ element }) => isSymlinkCreatingCommand(element))
  const hasGitSubCommand = allSubCommands.some(
    ({ element }) => resolveToCanonical(element.name) === 'git',
  )
  if (hasCdSubCommand && hasGitSubCommand) {
    decisions.push({
      behavior: 'ask',
      message:
        '包含 cd/Set-Location 和 git 的复合命令需要批准，以防止裸仓库攻击',
    })
  }

  // cd+write 复合守卫 — 被 checkPathConstraints(compoundCommandHasCd) 取代。
  // 之前此块在 hasCdSubCommand && hasAcceptEditsWrite 时推送 'ask'，
  // 但现在 checkPathConstraints 接收 hasCdSubCommand 并针对 cd 复合命令中的任何路径操作（读或写）
  // 推送 'ask' — 在路径层面覆盖范围更广（与 BashTool 一致）。步骤 5 的 !hasCdSubCommand 门禁
  // 和 modeValidation 的 compound-cd 守卫作为纵深防御保留，用于不经过 checkPathConstraints 的路径
  // （例如，不在 CMDLET_PATH_CONFIG 中的 cmdlet）。

  // 决策：裸 git 仓库守卫 — bash 对等。
  // 如果 cwd 有 HEAD/objects/refs/ 而没有有效的 .git/HEAD，Git 会将 cwd 视为裸仓库
  // 并从 cwd 运行钩子。攻击者创建 hooks/pre-commit，删除 .git/HEAD，然后任何 git 子命令都会运行它。
  // 移植自 BashTool readOnlyValidation.ts 的 isCurrentDirectoryBareGitRepo。
  if (hasGitSubCommand && isCurrentDirectoryBareGitRepo()) {
    decisions.push({
      behavior: 'ask',
      message:
        '在具有裸仓库指示符（cwd 中有 HEAD、objects/、refs/ 但没有 .git/HEAD）的目录中执行 git 命令。Git 可能从 cwd 执行钩子。',
    })
  }

  // 决策：git 内部路径写入守卫 — bash 对等。
  // 复合命令创建 HEAD/objects/refs/hooks/ 然后运行 git → 新创建的恶意钩子被执行。
  // 检查所有提取的写入路径 + 重定向目标是否符合 git 内部模式。
  // 移植自 BashTool 的 commandWritesToGitInternalPaths，适配 AST。
  if (hasGitSubCommand) {
    const writesToGitInternal = allSubCommands.some(
      ({ element, statement }) => {
        // 此子命令上的重定向目标（原始 Extent.Text — 引号和 ./ 完整保留；标准化器处理两者）
        for (const r of element.redirections ?? []) {
          if (isGitInternalPathPS(r.target)) return true
        }
        // 写入 cmdlet 参数 (new-item HEAD; mkdir hooks; set-content hooks/pre-commit)
        const canonical = resolveToCanonical(element.name)
        if (!GIT_SAFETY_WRITE_CMDLETS.has(canonical)) return false
        // 原始参数文本 — 标准化器剥离冒号绑定的参数、引号、./、大小写。
        // PS ArrayLiteralAst (`New-Item a,hooks/pre-commit`) 表现为单个逗号连接的参数 — 在检查前分割。
        if (
          element.args
            .flatMap(a => a.split(','))
            .some(a => isGitInternalPathPS(a))
        ) {
          return true
        }
        // 管道输入：`"hooks/pre-commit" | New-Item -ItemType File` 在运行时将字符串绑定到 -Path。
        // 路径在非 CommandAst 的管道元素中，不在 element.args 中。
        // 步骤 5 的 hasExpressionSource 守卫已经在此强制批准；此检查仅添加 git 内部警告文本。
        if (statement !== null) {
          for (const c of statement.commands) {
            if (c.elementType === 'CommandAst') continue
            if (isGitInternalPathPS(c.text)) return true
          }
        }
        return false
      },
    )
    // 同时检查顶级文件重定向 (> hooks/pre-commit)
    const redirWritesToGitInternal = getFileRedirections(parsed).some(r =>
      isGitInternalPathPS(r.target),
    )
    if (writesToGitInternal || redirWritesToGitInternal) {
      decisions.push({
        behavior: 'ask',
        message:
          '命令写入 git 内部路径（HEAD、objects/、refs/、hooks/、.git/）并运行 git。这可能植入恶意钩子，随后由 git 执行。',
      })
    }
    // 安全性：归档解压 TOCTOU。isCurrentDirectoryBareGitRepo 在权限评估时检查；
    // `tar -xf x.tar; git status` 在检查之后、git 运行之前提取裸仓库指示符。
    // 与可以检查参数中 git 内部路径的写入 cmdlet 不同，归档内容是未知的 —
    // 任何与 git 复合的解压操作都必须询问。
    const hasArchiveExtractor = allSubCommands.some(({ element }) =>
      GIT_SAFETY_ARCHIVE_EXTRACTORS.has(element.name.toLowerCase()),
    )
    if (hasArchiveExtractor) {
      decisions.push({
        behavior: 'ask',
        message:
          '复合命令解压归档文件并运行 git。归档内容可能植入裸仓库指示符（HEAD、hooks/、refs/），git 随后会将其视为仓库根目录。',
      })
    }
  }

  // .git/ 写入即使没有 git 子命令也是危险的 — 植入的 .git/hooks/pre-commit 会在用户下次提交时触发。
  // 与上面的裸仓库检查不同（后者因 `hooks/` 是常见项目目录名而门控于 hasGitSubCommand），
  // `.git/` 是明确的。
  {
    const found =
      allSubCommands.some(({ element }) => {
        for (const r of element.redirections ?? []) {
          if (isDotGitPathPS(r.target)) return true
        }
        const canonical = resolveToCanonical(element.name)
        if (!GIT_SAFETY_WRITE_CMDLETS.has(canonical)) return false
        return element.args.flatMap(a => a.split(',')).some(isDotGitPathPS)
      }) || getFileRedirections(parsed).some(r => isDotGitPathPS(r.target))
    if (found) {
      decisions.push({
        behavior: 'ask',
        message:
          '命令写入 .git/ — 植入其中的钩子或配置将在下次 git 操作时执行。',
      })
    }
  }

  // 决策：路径约束 — 原步骤 4.44 (:835-845)。
  // 之前被早期询问掩盖的拒绝能力检查。当 Edit(...) 拒绝规则匹配提取的路径时返回 'deny'
  // （pathValidation 第 ~994, 1088, 1160, 1210 行），对工作目录外的路径返回 'ask'，
  // 否则 'passthrough'。
  //
  // 传递 hasCdSubCommand（与 BashTool 的 compoundCommandHasCd 对等）：当复合命令包含改变 cwd 的 cmdlet 时，
  // checkPathConstraints 对任何包含路径操作的语句强制 'ask' — 相对路径会相对于过时的验证器 cwd 解析，
  // 而不是 PowerShell 的运行时 cwd。这是针对 CWD 不同步集群（发现 #3/#21/#27/#28）的架构性修复，
  // 用路径解析层的单一门禁取代了每个自动允许点的守卫。
  const pathResult = checkPathConstraints(
    input,
    parsed,
    toolPermissionContext,
    hasCdSubCommand,
  )
  if (pathResult.behavior !== 'passthrough') {
    decisions.push(pathResult)
  }

  // 决策：精确允许（解析成功的情况）— 原步骤 4.45 (:861-867)。
  // 与 BashTool 顺序一致：子命令拒绝 → 路径约束 → 精确允许。
  // 归约强制执行拒绝 > 询问 > 允许，因此精确允许仅在没有拒绝或询问触发时才出现 — 与顺序相同。
  //
  // 安全性：nameType 门禁 — 镜像 L696-700 处的解析失败守卫。
  // 输入侧的 stripModulePrefix 是无条件的：`scripts\Get-Content` 剥离为 `Get-Content`，
  // canonicalCommand 匹配精确允许。没有此门禁，allow 进入 decisions[] 且归约会在步骤 5
  // 检查 nameType 之前返回它 — PowerShell 运行本地 .ps1 文件。解析成功时 AST 的第一个命令元素的 nameType 是权威的；
  // 'application' 表示脚本/可执行文件路径，而非 cmdlet。
  // 安全性：与下面每个子命令循环相同的 argLeaksValue 门禁（发现 #32）。
  // 没有它，`PowerShell(Write-Output:*)` 精确匹配 `Write-Output $env:DOGE_API_KEY`，
  // 将 allow 推入 decisions[]，归约在每个子命令门禁运行之前返回它。allSubCommands.every 检查确保语句中没有命令泄漏
  // （单命令精确允许有一个元素；管道有多个）。
  //
  // 安全性：nameType 门禁必须检查所有子命令，而不仅仅是 [0]（发现 #10）。
  // L171 处的 canonicalCommand 将 `\n` 折叠为空格，因此 `code\n.\build.ps1`（两个语句）
  // 匹配精确规则 `PowerShell(code .\build.ps1)`。仅检查 allSubCommands[0] 会让第二个语句（nameType=application，脚本路径）通过。
  // 要求每个子命令的 nameType !== 'application'。
  if (
    exactMatchResult.behavior === 'allow' &&
    allSubCommands[0] !== undefined &&
    allSubCommands.every(
      sc =>
        sc.element.nameType !== 'application' &&
        !argLeaksValue(sc.text, sc.element),
    )
  ) {
    decisions.push(exactMatchResult)
  }

  // 决策：只读允许列表 — 原步骤 4.5 (:869-885)。
  // 镜像 Bash 对 ls、cat、git status 等的自动允许。PowerShell 等效项：
  // Get-Process、Get-ChildItem、Get-Content、git log 等。
  // 归约将其置于子命令询问规则之下（询问 > 允许）。
  if (isReadOnlyCommand(command, parsed)) {
    decisions.push({
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: '命令是只读的，可以安全执行',
      },
    })
  }

  // 决策：文件重定向 — 原 :887-900。
  // 重定向（>、>>、2>）写入任意路径。isReadOnlyCommand 内部已经拒绝重定向，
  // 因此这不会与上面的只读允许冲突。归约将其置于 checkPermissionMode 允许之上。
  const fileRedirections = getFileRedirections(parsed)
  if (fileRedirections.length > 0) {
    decisions.push({
      behavior: 'ask',
      message: '命令包含可能写入任意路径的文件重定向',
      suggestions: suggestionForExactCommand(command),
    })
  }

  // 决策：模式特定处理（acceptEdits）— 原步骤 4.7 (:902-906)。
  // checkPermissionMode 仅返回 'allow' | 'passthrough'。
  const modeResult = checkPermissionMode(input, parsed, toolPermissionContext)
  if (modeResult.behavior !== 'passthrough') {
    decisions.push(modeResult)
  }

  // 归约：拒绝 > 询问 > 允许 > 传递。每种行为类型的第一个胜出
  // （对单检查情况保留步骤顺序的消息）。如果没有决策，
  // 则落入步骤 5 的每个子命令批准收集。
  const deniedDecision = decisions.find(d => d.behavior === 'deny')
  if (deniedDecision !== undefined) {
    return deniedDecision
  }
  const askDecision = decisions.find(d => d.behavior === 'ask')
  if (askDecision !== undefined) {
    return askDecision
  }
  const allowDecision = decisions.find(d => d.behavior === 'allow')
  if (allowDecision !== undefined) {
    return allowDecision
  }

  // 5. 管道/语句分割：独立检查每个子命令。
  // 这防止了像 "Get-Process:*" 这样的前缀规则悄悄允许
  // 管道命令如 "Get-Process | Stop-Process -Force"。
  // 注意：拒绝规则已在上面（4.4）检查，因此此循环处理
  // 询问规则、显式允许规则和只读允许列表回退。

  // 过滤掉安全的输出 cmdlet（Format-Table 等）— 它们在步骤 4.4 中已检查拒绝规则，
  // 但这里不应需要独立批准。
  // 同时过滤掉 cd/Set-Location 到 CWD 的情况（模型习惯，与 Bash 对等）。
  const subCommands = allSubCommands.filter(({ element, isSafeOutput }) => {
    if (isSafeOutput) {
      return false
    }
    // 安全性：nameType 门禁 — 第六处位置。从批准列表中过滤掉是一种自动允许形式。
    // scripts\\Set-Location . 会在下方匹配（剥离后的名称 'Set-Location'，参数 '.' → CWD）并被悄悄丢弃，
    // 然后 scripts\\Set-Location.ps1 无需提示即可执行。将 'application' 命令保留在列表中，
    // 以便它们到达 isAllowlistedCommand（其会拒绝它们）。
    if (element.nameType === 'application') {
      return true
    }
    const canonical = resolveToCanonical(element.name)
    if (canonical === 'set-location' && element.args.length > 0) {
      // 安全性：使用 PS_TOKENIZER_DASH_CHARS，而非仅限于 ASCII 的 startsWith('-')。
      // `Set-Location –Path .`（en-dash）会将 `–Path` 视为目标，
      // 相对于 cwd 解析（不匹配），并将命令保留在批准列表中 — 正确。
      // 但 `Set-Location –LiteralPath evil` 使用 en-dash 会找到 `–LiteralPath` 作为“目标”，
      // 与 cwd 不匹配，保留在列表中 — 也是正确的。风险是相反情况：
      // Unicode 破折号参数被视为位置目标。使用分词器破折号集合。
      const target = element.args.find(
        a => a.length === 0 || !PS_TOKENIZER_DASH_CHARS.has(a[0]!),
      )
      if (target && resolve(getCwd(), target) === getCwd()) {
        return false
      }
    }
    return true
  })

  // 注意：cd+git 复合守卫已在步骤 4.42 运行。如果到达此处，则要么没有 cd，要么没有 git 在复合命令中。

  const subCommandsNeedingApproval: string[] = []
  // 其子命令在下方步骤 5 循环中被推入 subCommandsNeedingApproval 的语句。
  // 故障关闭门禁（循环之后）仅推送未在此跟踪的语句 — 防止重复建议，
  // 例如同时出现 "Get-Process"（子命令）和 "$x = Get-Process"（完整语句）。
  //
  // 安全性：仅在推送时跟踪，而非循环入口。
  // 如果一个语句仅有的子命令通过用户允许规则 `continue`（L1113），
  // 在循环入口标记它会使得故障关闭门禁跳过它 — 自动允许不可见的非 CommandAst 内容，
  // 如控制流中的裸 `$env:SECRET`。攻击示例：用户批准 Get-Process，
  // 然后 `if ($true) { Get-Process; $env:SECRET }` — Get-Process 被允许规则命中（continue，无推送），
  // $env:SECRET 是 VariableExpressionAst（非子命令），语句标记为已见 → 门禁跳过 → 自动允许 → 秘密泄漏。
  // 仅在推送时跟踪：语句保持未标记 → 门禁触发 → 询问。
  const statementsSeenInLoop = new Set<
    ParsedPowerShellCommand['statements'][number]
  >()

  for (const { text: subCmd, element, statement } of subCommands) {
    // 首先检查拒绝规则 - 用户显式规则优先于允许列表
    const subInput = { command: subCmd }
    const subResult = powershellToolCheckPermission(
      subInput,
      toolPermissionContext,
    )

    if (subResult.behavior === 'deny') {
      return {
        behavior: 'deny',
        message: `使用命令 ${command} 执行 ${POWERSHELL_TOOL_NAME} 的权限已被拒绝。`,
        decisionReason: subResult.decisionReason,
      }
    }

    if (subResult.behavior === 'ask') {
      if (statement !== null) {
        statementsSeenInLoop.add(statement)
      }
      subCommandsNeedingApproval.push(subCmd)
      continue
    }

    // 由用户规则显式允许 — 但不适用于应用程序/脚本。
    // 安全性：输入侧的 stripModulePrefix 是无条件的，因此
    // `scripts\Get-Content /etc/shadow` 剥离为 'Get-Content' 并匹配
    // 允许规则 `Get-Content:*`。没有 nameType 守卫，continue 会跳过所有检查，
    // 本地脚本运行。nameType 根据剥离前的原始名称分类 —
    // `scripts\Get-Content` → 'application'（有 `\`）。
    // 模块限定的 cmdlet 也会分类为 'application' — 故障安全的过度触发。
    // 应用程序绝不应被 cmdlet 允许规则自动允许。
    if (
      subResult.behavior === 'allow' &&
      element.nameType !== 'application' &&
      !hasSymlinkCreate
    ) {
      // 安全性：用户允许规则断言 cmdlet 是安全的，而不是断言
      // 通过它进行的任意变量扩展是安全的。允许 PowerShell(Write-Output:*) 的用户
      // 并非有意自动允许 `Write-Output $env:DOGE_API_KEY`。
      // 应用与下方保护内置允许列表路径相同的 argLeaksValue 门禁 — 拒绝
      // Variable/Other/ScriptBlock/SubExpression 元素类型和冒号绑定的表达式子节点。（安全发现 #32）
      //
      // 安全性：当复合命令包含符号链接创建命令时也跳过（发现 — 符号链接+读取间隙）。
      // New-Item -ItemType SymbolicLink 可以将后续读取重定向到任意路径。
      // 内置允许列表路径（下方）和 acceptEdits 路径均门控于 !hasSymlinkCreate；
      // 用户规则路径也必须如此。
      if (argLeaksValue(subCmd, element)) {
        if (statement !== null) {
          statementsSeenInLoop.add(statement)
        }
        subCommandsNeedingApproval.push(subCmd)
        continue
      }
      continue
    }
    if (subResult.behavior === 'allow') {
      // nameType === 'application' 且匹配允许规则：规则是为 cmdlet 编写的，
      // 但这是一个冒充的脚本/可执行文件。不要 continue；落入批准（非拒绝 — 用户可能
      // 确实想运行 `scripts\Get-Content` 并会看到提示）。
      if (statement !== null) {
        statementsSeenInLoop.add(statement)
      }
      subCommandsNeedingApproval.push(subCmd)
      continue
    }

    // 安全性：故障关闭门禁。除非父语句是 PipelineAst 且其每个元素都是 CommandAst，
    // 否则不采取允许列表捷径。这取代了之前的 hasExpressionSource 检查
    // （表达式源是一种导致语句不通过门禁的方式），并且按构造也拒绝赋值、链操作符、控制流
    // 以及任何未来的 AST 类型。此门禁阻止的示例：
    //   'env:SECRET_API_KEY' | Get-Content  — CommandExpressionAst 元素
    //   $x = Get-Process                   — AssignmentStatementAst
    //   Get-Process && Get-Service         — PipelineChainAst
    // 显式用户允许规则（上面）在此门禁之前运行，但应用其自己的 argLeaksValue 检查；
    // 两条路径现在都门控参数 elementTypes。
    //
    // 安全性：当复合命令包含改变 cwd 的 cmdlet 时也跳过（发现 #27 — cd+读取间隙）。
    // isAllowlistedCommand 独立验证 Get-Content，但 `Set-Location ~; Get-Content ./.ssh/id_rsa`
    // 从 ~ 运行 Get-Content，而非验证器的 cwd。路径验证看到 /project/.ssh/id_rsa；
    // 运行时读取 ~/.ssh/id_rsa。与下方的 checkPermissionMode 调用和 checkPathConstraints 传递相同的门禁。
    if (
      statement !== null &&
      !hasCdSubCommand &&
      !hasSymlinkCreate &&
      isProvablySafeStatement(statement) &&
      isAllowlistedCommand(element, subCmd)
    ) {
      continue
    }

    // 检查每个子命令的 acceptEdits 模式（与 BashTool 对等）。
    // 委托给对单语句 AST 的 checkPermissionMode，以便其所有守卫都应用：
    // 表达式管道源（非 CommandAst 元素）、安全标志（子表达式、脚本块、赋值、splatting 等）、
    // 以及 ACCEPT_EDITS_ALLOWED_CMDLETS 允许列表。这为 acceptEdits 模式下语句的安全定义保持了单一事实来源 —
    // checkPermissionMode 的任何未来加固都会自动应用于此。
    //
    // 传递 parsed.variables（而非 []），以便复合命令中任何语句的 splatting 都可见。
    // 保守：如果我们无法判断 splatted 变量影响哪个语句，则假设它影响所有语句。
    //
    // 安全性：当复合命令包含改变 cwd 的命令（Set-Location/Push-Location/Pop-Location）时跳过此自动允许路径。
    // 合成的单语句 AST 剥离了复合上下文，因此 checkPermissionMode 看不到其他语句中的 cd。
    // 没有此门禁，`Set-Location ./.claude; Set-Content ./settings.json '...'` 会通过：
    // Set-Content 被独立检查，匹配 ACCEPT_EDITS_ALLOWED_CMDLETS 并自动允许 —
    // 但 PowerShell 从更改后的 cwd 运行它，写入 .claude/settings.json（路径验证器未检查的 Claude 配置文件）。
    // 这与 BashTool 的 compoundCommandHasCd 守卫一致。
    if (statement !== null && !hasCdSubCommand && !hasSymlinkCreate) {
      const subModeResult = checkPermissionMode(
        { command: subCmd },
        {
          valid: true,
          errors: [],
          variables: parsed.variables,
          hasStopParsing: parsed.hasStopParsing,
          originalCommand: subCmd,
          statements: [statement],
        },
        toolPermissionContext,
      )
      if (subModeResult.behavior === 'allow') {
        continue
      }
    }

    // 不在允许列表中，无模式自动允许，且无显式规则 — 需要批准
    if (statement !== null) {
      statementsSeenInLoop.add(statement)
    }
    subCommandsNeedingApproval.push(subCmd)
  }

  // 安全性：故障关闭门禁（第二部分）。上面的步骤 5 循环仅迭代
  // getSubCommandsForPermissionCheck 呈现且通过安全输出过滤器的子命令。
  // 产生零个 CommandAst 子命令（裸 $env:SECRET）或仅有的子命令被过滤为安全输出（$env:X | Out-String）的语句
  // 永远不会进入循环。没有此门禁，它们会在空的 subCommandsNeedingApproval 上默默自动允许。
  //
  // 仅推送上面未跟踪的语句：如果循环从某个语句推送了任何子命令，
  // 用户将看到提示。同时推送语句文本会导致重复建议，即接受子命令规则并不能防止重新提示。
  // 如果所有子命令都 `continue`（允许规则命中 / 允许列表 / 模式允许），
  // 则该语句未被跟踪，下面的门禁会重新检查它 — 这是故障关闭属性。
  for (const stmt of parsed.statements) {
    if (!isProvablySafeStatement(stmt) && !statementsSeenInLoop.has(stmt)) {
      subCommandsNeedingApproval.push(stmt.text)
    }
  }

  if (subCommandsNeedingApproval.length === 0) {
    // 安全性：仅当没有不可验证的内容时，空列表自动允许才是安全的。
    // 如果管道有脚本块，每个安全输出 cmdlet 在 :1032 处被过滤掉，但块内容未被验证 —
    // 非命令 AST 节点（AssignmentStatementAst 等）对 getAllCommands 不可见。
    // `Where-Object {$true} | Sort-Object {$env:PATH='evil'}` 会在此处自动允许。
    // hasAssignments 是仅顶层的（parser.ts:1385），因此它也不能捕获嵌套赋值。改为提示。
    if (deriveSecurityFlags(parsed).hasScriptBlocks) {
      return {
        behavior: 'ask',
        message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
        decisionReason: {
          type: 'other',
          reason: '管道由输出格式化 cmdlet 与脚本块组成 — 块内容无法验证',
        },
      }
    }
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: '所有管道命令均已单独允许',
      },
    }
  }

  // 6. 一些子命令需要批准 — 构建建议
  const decisionReason = {
    type: 'other' as const,
    reason: '此命令需要批准',
  }

  const pendingSuggestions: PermissionUpdate[] = []
  for (const subCmd of subCommandsNeedingApproval) {
    pendingSuggestions.push(...suggestionForExactCommand(subCmd))
  }

  return {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(
      POWERSHELL_TOOL_NAME,
      decisionReason,
    ),
    decisionReason,
    suggestions: pendingSuggestions,
  }
}