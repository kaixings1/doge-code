import type { Command, LocalCommandResult } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { SubscribePRTool } from '../tools/SubscribePRTool/SubscribePRTool.js'

/**
 * /subscribe-pr — 订阅 GitHub PR 状态变化（对齐官方 KAIROS GitHub webhooks）。
 *
 * 门控：`CLAUDE_CODE_FEATURE_KAIROS_GITHUB_WEBHOOKS=1`（src/commands.ts:276）。
 *
 * 此前为空壳：
 *   `export default function subscribePrCommand() { return null }`
 * 即使把开关打开，resolveCommandExport 拿到的仍是 null → 命令永远不注册。
 *
 * 现接线到已实现的 `SubscribePRTool`（318 行，含订阅持久化 + gh CLI 状态查询
 * + poll 变更检测 + 本地 webhook 服务器），复用其 `execute()`，
 * 不重写第二份订阅逻辑。
 *
 * 关于大陆可达性：状态查询走 **`gh` CLI**（GitHub REST API，github.com 可访问），
 * 不依赖 claude.ai / Anthropic 云端。
 *
 * 用法：
 *   /subscribe-pr subscribe owner/repo 123    订阅某 PR
 *   /subscribe-pr list                        列出订阅及当前状态
 *   /subscribe-pr poll                        轮询订阅并报告状态变化
 *   /subscribe-pr unsubscribe owner/repo 123  取消订阅
 *   /subscribe-pr check owner/repo 123        查看 PR 详情
 *   /subscribe-pr webhook-start 45679         启动本地 webhook 服务器
 *   /subscribe-pr webhook-status              查看 webhook 服务器状态
 */

// 单例：webhook 服务器状态与事件缓冲挂在实例上，多次调用须共用同一实例
const tool = new SubscribePRTool()

export interface SubscribePrArgs {
  action: string
  repo: string
  pr: number
  port?: number
  limit?: number
  help: boolean
}

const ACTIONS = new Set([
  'check',
  'list',
  'subscribe',
  'unsubscribe',
  'poll',
  'webhook-start',
  'webhook-stop',
  'webhook-status',
  'webhook-events',
])

/**
 * 解析 /subscribe-pr 参数。纯函数，便于单测。
 *
 * 形态：`<action> [owner/repo] [prNumber] [--port N] [--limit N]`
 */
export function parseSubscribePrArgs(args: string | undefined): SubscribePrArgs {
  const result: SubscribePrArgs = { action: 'list', repo: '', pr: 0, help: false }
  const tokens = (args ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return result

  const positional: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token === '--port' || token === '--limit') {
      const value = Number(tokens[i + 1])
      if (Number.isFinite(value)) {
        if (token === '--port') result.port = value
        else result.limit = value
      }
      i++
      continue
    }
    if (token === 'help' || token === '--help' || token === '-h') {
      result.help = true
      continue
    }
    positional.push(token)
  }

  if (positional[0]) {
    const action = positional[0].toLowerCase()
    if (ACTIONS.has(action)) result.action = action
    else result.help = true // 未知动作 → 显示用法
  }

  const repo = positional.find(t => t.includes('/'))
  if (repo) result.repo = repo

  for (const token of positional.slice(1)) {
    if (token.includes('/')) continue
    const num = Number(token)
    if (Number.isInteger(num) && num > 0) {
      result.pr = num
      break
    }
  }

  return result
}

const HELP_TEXT = [
  '## /subscribe-pr — 订阅 GitHub PR 状态变化',
  '',
  '用法：',
  '  /subscribe-pr subscribe <owner/repo> <pr>    订阅某 PR',
  '  /subscribe-pr list                            列出订阅及当前状态',
  '  /subscribe-pr poll                            轮询订阅并报告状态变化',
  '  /subscribe-pr unsubscribe <owner/repo> <pr>   取消订阅',
  '  /subscribe-pr check <owner/repo> <pr>         查看 PR 详情',
  '',
  'Webhook（本地接收 GitHub 推送）：',
  '  /subscribe-pr webhook-start [--port 45679]    启动本地 webhook 服务器',
  '  /subscribe-pr webhook-stop                    停止 webhook 服务器',
  '  /subscribe-pr webhook-status                  查看服务器状态',
  '  /subscribe-pr webhook-events [--limit 20]     查看收到的事件',
  '',
  '依赖：`gh` CLI（GitHub REST API，github.com 可访问）。',
  '订阅记录：`~/.doge/pr-subscriptions.json`',
].join('\n')

/** 把工具返回的 `{ content: [{ type, text }] }` 摊平成文本 */
function flatten(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> } | null)?.content
  if (!Array.isArray(content)) return ''
  return content.map(part => part?.text ?? '').filter(Boolean).join('\n')
}

const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const parsed = parseSubscribePrArgs(args)
  if (parsed.help) {
    return { type: 'text', value: HELP_TEXT }
  }

  try {
    const result = await tool.execute({
      action: parsed.action,
      repo: parsed.repo,
      pr: parsed.pr,
      ...(parsed.port !== undefined ? { port: parsed.port } : {}),
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    })
    const text = flatten(result)
    return { type: 'text', value: text || '（无输出）' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { type: 'text', value: `❌ subscribe-pr 执行失败: ${message}` }
  }
}

const subscribePrCommand: Command = {
  type: 'local',
  name: 'subscribe-pr',
  description: '订阅 GitHub PR 状态变化（对齐官方 KAIROS GitHub webhooks）',
  aliases: ['/subscribe-pr', '/sub-pr'],
  argumentHint: '<subscribe|list|poll|unsubscribe|check|webhook-*> [owner/repo] [pr] [--port N]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default subscribePrCommand