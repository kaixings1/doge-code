import { registerBundledSkill } from '../bundledSkills.js'
import { getUsageReport, pinSkill } from './skillUsage.js'
import { runCuratorPass, runLifecycleTransitions, formatCuratorReport } from './skillCurator.js'

async function buildReviewPrompt(args: string): Promise<string> {
  const trimmed = args.trim()

  // /curator-review run: 强制策展人审查
  if (trimmed === 'run') {
    const counts = await runLifecycleTransitions()
    return formatCuratorReport(counts)
  }

  // /curator-review: 显示当前状态
  const report = await getUsageReport()

  const active = report.filter(r => {
    const daysSinceUse = (Date.now() - new Date(r.lastUsedAt).getTime()) / 86400_000
    return daysSinceUse < 30 && !r.pinned
  })
  const stale = report.filter(r => {
    const daysSinceUse = (Date.now() - new Date(r.lastUsedAt).getTime()) / 86400_000
    return daysSinceUse >= 30 && daysSinceUse < 90 && !r.pinned
  })
  const archived = report.filter(r => {
    const daysSinceUse = (Date.now() - new Date(r.lastUsedAt).getTime()) / 86400_000
    return daysSinceUse >= 90 && !r.pinned
  })
  const pinned = report.filter(r => r.pinned)

  return [
    '## 策展人审查 — 技能状态',
    '',
    `总计追踪: ${report.length}`,
    '',
    '### 活跃 (' + active.length + ')',
    ...active.map(s => '  - ' + s.name + ' (使用 ' + s.invocationCount + 'x, 上次 ' + timeAgo(s.lastUsedAt) + ')'),
    '',
    '### 陈旧 (' + stale.length + ') — 超过30天未使用，归档候选',
    ...stale.map(s => '  - ' + s.name + ' (使用 ' + s.invocationCount + 'x, 上次 ' + timeAgo(s.lastUsedAt) + ')'),
    '',
    '### 已归档 (' + archived.length + ') — 超过90天未使用',
    ...archived.map(s => '  - ' + s.name + ' (使用 ' + s.invocationCount + 'x, 上次 ' + timeAgo(s.lastUsedAt) + ')'),
    '',
    '### 已固定 (' + pinned.length + ') — 免于自动归档',
    ...pinned.map(s => '  - ' + s.name),
    '',
    '### 命令',
    '  /curator-review run        — 强制策展人生命周期审查',
    '  /curator-review pin <name> — 固定技能（免于归档）',
    '  /curator-review unpin <name> — 取消固定技能',
  ].join('\n')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400_000)
  if (days < 1) return '今天'
  if (days < 30) return days + '天前'
  const months = Math.floor(days / 30)
  return months + '个月前'
}

export function registerCuratorReviewSkill(): void {
  registerBundledSkill({
    name: 'curator-review',
    description: '查看技能使用情况并管理生命周期（固定/取消固定技能，触发策展人审查）。',
    whenToUse: '当你想要查看哪些技能正在被使用、固定重要技能，或触发策展人生命周期审查时。',
    argumentHint: '[run|pin <name>|unpin <name>]',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const trimmed = args.trim()

      // 处理 pin/unpin 命令
      if (trimmed.startsWith('pin ')) {
        const name = trimmed.slice(4).trim()
        if (name) {
          await pinSkill(name, true)
          return [{ type: 'text' as const, text: '已固定技能: ' + name }]
        }
      }
      if (trimmed.startsWith('unpin ')) {
        const name = trimmed.slice(6).trim()
        if (name) {
          await pinSkill(name, false)
          return [{ type: 'text' as const, text: '已取消固定技能: ' + name }]
        }
      }

      const text = await buildReviewPrompt(trimmed)
      return [{ type: 'text' as const, text }]
    },
  })
}
