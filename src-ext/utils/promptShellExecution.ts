import { randomUUID } from 'crypto'
import type { Tool, ToolUseContext } from '../Tool.js'
import { BashTool } from '../tools/BashTool/BashTool.js'
import { logForDebugging } from './debug.js'
import { errorMessage, MalformedCommandError, ShellError } from './errors.js'
import type { FrontmatterShell } from './frontmatterParser.js'
import { createAssistantMessage } from './messages.js'
import { hasPermissionsToUseTool } from './permissions/permissions.js'
import { processToolResultBlock } from './toolResultStorage.js'

// BashTool 与 PowerShellTool 共同满足的窄化结构切片。不能使用基础的 Tool 类型：
// 它要求 call() 的 canUseTool/parentMessage 参数为必需，但两个具体工具都将其设为可选，
// 且原代码仅以 2 个参数调用 BashTool.call({ command }, ctx)。也不能使用 `typeof BashTool`：
// BashTool 的输入 schema 包含 PowerShellTool 所没有的字段（例如 _simulatedSedEdit）。
// 注意：此处直接调用 call()，绕过了 validateInput —— 任何关键检查必须位于 call() 自身内部（见 PR #23311）。
type ShellOut = { stdout: string; stderr: string; interrupted: boolean }
type PromptShellTool = Tool & {
  call(
    input: { command: string },
    context: ToolUseContext,
  ): Promise<{ data: ShellOut }>
}

import { isPowerShellToolEnabled } from './shell/shellToolUtils.js'

// 懒加载：此文件位于启动导入链中（main → commands → loadSkillsDir → 此处）。
// 静态导入会导致在所有平台上启动时加载 PowerShellTool.ts（及传递依赖的 parser.ts、校验器等），
// 从而破坏 tools.ts 中的延迟 require。推迟至首个实际使用 `shell: powershell` 的技能运行时。
const getPowerShellTool = (() => {
  let cached: PromptShellTool | undefined
  return (): PromptShellTool => {
    if (!cached) {
      cached = (
        require('../tools/PowerShellTool/PowerShellTool.js') as typeof import('../tools/PowerShellTool/PowerShellTool.js')
      ).PowerShellTool
    }
    return cached
  }
})()

// 代码块模式：```! command ```
const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g

// 内联模式：!`command`
// 使用正向后行断言要求 ! 之前为空白字符或行首。
// 防止在 Markdown 内联代码段（如 `!!`）或相邻段（如 `foo`!`bar`）以及 Shell 变量（如 $!）中产生误匹配。
// eslint-disable-next-line custom-rules/no-lookbehind-regex -- 通过 text.includes('!`') 门控（PR#22986）
const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm

/**
 * 解析提示文本并执行其中嵌入的 Shell 命令。
 * 支持两种语法：
 * - 代码块：```! command ```
 * - 内联：!`command`
 *
 * @param shell - 命令应路由到的 Shell。默认为 bash。
 *   该值*从不*从 settings.defaultShell 读取 —— 它源自 .md frontmatter（作者的指定），
 *   或对内置命令未定义。参见 docs/design/ps-shell-selection.md §5.3。
 */
export async function executeShellCommandsInPrompt(
  text: string,
  context: ToolUseContext,
  slashCommandName: string,
  shell?: FrontmatterShell,
): Promise<string> {
  let result = text

  // 解析一次工具。`shell === undefined` 与 `shell === 'bash'` 均命中 BashTool。
  // 仅当运行时门控允许时使用 PowerShell —— 技能作者 frontmatter 的选择不会覆盖用户的 opt-in/out。
  const shellTool: PromptShellTool =
    shell === 'powershell' && isPowerShellToolEnabled()
      ? getPowerShellTool()
      : BashTool

  // INLINE_PATTERN 的正向后行断言在大段技能内容上的速度比 BLOCK_PATTERN 慢约 100 倍（17KB 下 265µs vs 2µs）。
  // 93% 的技能根本不包含 !`，因此通过廉价的子字符串检查来门控昂贵的扫描。
  // BLOCK_PATTERN（```!）不要求文本中存在 !`，故始终扫描。
  const blockMatches = text.matchAll(BLOCK_PATTERN)
  const inlineMatches = text.includes('!`') ? text.matchAll(INLINE_PATTERN) : []

  await Promise.all(
    [...blockMatches, ...inlineMatches].map(async match => {
      const command = match[1]?.trim()
      if (command) {
        try {
          // 执行前检查权限
          const permissionResult = await hasPermissionsToUseTool(
            shellTool,
            { command },
            context,
            createAssistantMessage({ content: [] }),
            '',
          )

          if (permissionResult.behavior !== 'allow') {
            logForDebugging(
              `Shell 命令权限检查失败，命令位于 ${slashCommandName}：${command}。错误：${permissionResult.message}`,
            )
            throw new MalformedCommandError(
              `Shell 命令权限检查失败，模式 "${match[0]}"：${permissionResult.message || '权限被拒绝'}`,
            )
          }

          const { data } = await shellTool.call({ command }, context)
          // 复用与常规 Bash 工具调用相同的持久化流程
          const toolResultBlock = await processToolResultBlock(
            shellTool,
            data,
            randomUUID(),
          )
          // 从块中提取字符串内容
          const output =
            typeof toolResultBlock.content === 'string'
              ? toolResultBlock.content
              : formatBashOutput(data.stdout, data.stderr)
          // 函数替换器 —— 即使使用字符串搜索模式，String.replace 也会解释替换字符串中的 $$、$&、$`、$'。
          // Shell 输出（尤其是 PowerShell：$env:PATH、$$、$PSVersionTable）是任意的用户数据；
          // 裸字符串参数会破坏它。
          result = result.replace(match[0], () => output)
        } catch (e) {
          if (e instanceof MalformedCommandError) {
            throw e
          }
          formatBashError(e, match[0])
        }
      }
    }),
  )

  return result
}

function formatBashOutput(
  stdout: string,
  stderr: string,
  inline = false,
): string {
  const parts: string[] = []

  if (stdout.trim()) {
    parts.push(stdout.trim())
  }

  if (stderr.trim()) {
    if (inline) {
      parts.push(`[stderr: ${stderr.trim()}]`)
    } else {
      parts.push(`[stderr]\n${stderr.trim()}`)
    }
  }

  return parts.join(inline ? ' ' : '\n')
}

function formatBashError(e: unknown, pattern: string, inline = false): never {
  if (e instanceof ShellError) {
    if (e.interrupted) {
      throw new MalformedCommandError(
        `Shell 命令中断，模式 "${pattern}"：[命令被中断]`,
      )
    }
    const output = formatBashOutput(e.stdout, e.stderr, inline)
    throw new MalformedCommandError(
      `Shell 命令失败，模式 "${pattern}"：${output}`,
    )
  }

  const message = errorMessage(e)
  const formatted = inline ? `[错误: ${message}]` : `[错误]\n${message}`
  throw new MalformedCommandError(formatted)
}