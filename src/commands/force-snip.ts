import type { Command, LocalCommandResult } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { getHistoryLength, snipeHistory } from '../tools/SnipTool/SnipTool.js'

/**
 * /force-snip — 强制裁剪历史上下文以节省 token（对齐官方 HISTORY_SNIP 语义）。
 *
 * 门控：`CLAUDE_CODE_FEATURE_HISTORY_SNIP=1`（src/commands.ts:257）。
 *
 * 此前为空壳：
 *   `export default function forceSnipCommand() { return null }`
 * 即使把开关打开，resolveCommandExport 拿到的仍是 null → 命令永远不注册。
 *
 * 现接线到已实现的 `SnipTool.snipeHistory()`，**复用 SnipTool 的 historyStore**，
 * 不另建第二份历史状态（避免两处状态漂移）。
 *
 * 用法：
 *   /force-snip                         裁剪 100 条、保留最近 50 条
 *   /force-snip 200                     裁剪 200 条、保留最近 50 条
 *   /force-snip 200 30                  裁剪 200 条、保留最近 30 条
 *   /force-snip --no-preserve-system    连系统消息一并裁剪
 */

export const DEFAULT_SNIP_LINES = 100
export const DEFAULT_SNIP_KEEP = 50

export interface SnipArgs {
  lines: number
  keepRecent: number
  preserveSystem: boolean
  help: boolean
}

/**
 * 解析 /force-snip 参数。纯函数，便于单测。
 *
 * 非法数字（NaN / 负数）回退默认值而非抛错 —— 命令层不因手滑中断。
 */
export function parseSnipArgs(args: string | undefined): SnipArgs {
  const result: SnipArgs = {
    lines: DEFAULT_SNIP_LINES,
    keepRecent: DEFAULT_SNIP_KEEP,
    preserveSystem: true,
    help: false,
  }

  const numbers: number[] = []
  for (const token of (args ?? '').trim().split(/\s+/).filter(Boolean)) {
    if (token === '--no-preserve-system') {
      result.preserveSystem = false
      continue
    }
    if (token === 'help' || token === '--help' || token === '-h') {
      result.help = true
      continue
    }
    const parsed = Number(token)
    if (Number.isFinite(parsed) && parsed >= 0) numbers.push(Math.floor(parsed))
  }

  if (numbers.length > 0) result.lines = numbers[0]!
  if (numbers.length > 1) result.keepRecent = numbers[1]!
  return result
}

const HELP_TEXT = [
  '## /force-snip — 强制裁剪历史上下文',
  '',
  '用法：',
  '  /force-snip                         裁剪 100 条、保留最近 50 条',
  '  /force-snip <lines>                 指定裁剪条数',
  '  /force-snip <lines> <keepRecent>    指定裁剪条数与保留条数',
  '  /force-snip --no-preserve-system    连系统消息一并裁剪',
  '',
  '裁剪对象是 SnipTool 的历史存储（与 snip 工具共享同一份状态）。',
].join('\n')

const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const parsed = parseSnipArgs(args)
  if (parsed.help) {
    return { type: 'text', value: HELP_TEXT }
  }

  const before = getHistoryLength()
  const result = snipeHistory(parsed.lines, parsed.keepRecent, parsed.preserveSystem)

  if (before === 0) {
    return {
      type: 'text',
      value: '历史为空，无可裁剪。\n（SnipTool 的历史存储尚未记录任何消息）',
    }
  }

  const removed = result.removedTypes
  const detail = `user ${removed.user ?? 0} / assistant ${removed.assistant ?? 0} / system ${removed.system ?? 0}`

  return {
    type: 'text',
    value: [
      result.removed > 0
        ? `✅ 已裁剪 ${result.removed} 条消息`
        : `ℹ️ 未裁剪任何消息（保留 ${parsed.keepRecent} 条的约束未满足）`,
      '',
      `裁剪前: ${before} 条`,
      `裁剪后: ${result.kept} 条`,
      `按类型移除: ${detail}`,
      parsed.preserveSystem ? '已保留系统消息' : '⚠️ 系统消息一并裁剪',
    ].join('\n'),
  }
}

const forceSnip: Command = {
  type: 'local',
  name: 'force-snip',
  description: '强制裁剪历史上下文以节省 token（对齐官方 HISTORY_SNIP）',
  aliases: ['/force-snip', '/snip-history'],
  argumentHint: '[lines] [keepRecent] [--no-preserve-system]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default forceSnip