import { registerBundledSkill } from '../bundledSkills.js'
import { getUsageReport, pinSkill } from './skillUsage.js'
import { runCuratorPass, runLifecycleTransitions, formatCuratorReport } from './skillCurator.js'

async function buildReviewPrompt(args: string): Promise<string> {
  const trimmed = args.trim()

  // /curator-review run: force a curator pass
  if (trimmed === 'run') {
    const counts = await runLifecycleTransitions()
    return formatCuratorReport(counts)
  }

  // /curator-review: show current status
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
    '## Curator Review — Skill Status',
    '',
    `Total tracked: ${report.length}`,
    '',
    '### Active (' + active.length + ')',
    ...active.map(s => '  - ' + s.name + ' (used ' + s.invocationCount + 'x, last ' + timeAgo(s.lastUsedAt) + ')'),
    '',
    '### Stale (' + stale.length + ') — unused >30 days, archive candidates',
    ...stale.map(s => '  - ' + s.name + ' (used ' + s.invocationCount + 'x, last ' + timeAgo(s.lastUsedAt) + ')'),
    '',
    '### Archival (' + archived.length + ') — unused >90 days',
    ...archived.map(s => '  - ' + s.name + ' (used ' + s.invocationCount + 'x, last ' + timeAgo(s.lastUsedAt) + ')'),
    '',
    '### Pinned (' + pinned.length + ') — exempt from auto-archival',
    ...pinned.map(s => '  - ' + s.name),
    '',
    '### Commands',
    '  /curator-review run        — force a curator lifecycle pass',
    '  /curator-review pin <name> — pin a skill (exempt from archival)',
    '  /curator-review unpin <name> — unpin a skill',
  ].join('\n')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400_000)
  if (days < 1) return 'today'
  if (days < 30) return days + 'd ago'
  const months = Math.floor(days / 30)
  return months + 'mo ago'
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

      // Handle pin/unpin commands
      if (trimmed.startsWith('pin ')) {
        const name = trimmed.slice(4).trim()
        if (name) {
          await pinSkill(name, true)
          return [{ type: 'text' as const, text: 'Pinned skill: ' + name }]
        }
      }
      if (trimmed.startsWith('unpin ')) {
        const name = trimmed.slice(6).trim()
        if (name) {
          await pinSkill(name, false)
          return [{ type: 'text' as const, text: 'Unpinned skill: ' + name }]
        }
      }

      const text = await buildReviewPrompt(trimmed)
      return [{ type: 'text' as const, text }]
    },
  })
}
