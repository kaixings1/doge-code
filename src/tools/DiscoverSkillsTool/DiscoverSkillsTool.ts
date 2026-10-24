import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getBundledSkills } from '../../skills/bundledSkills.js'
import { getSkillDirCommands } from '../../skills/loadSkillsDir.js'
import { getPluginSkills } from '../../utils/plugins/loadPluginCommands.js'

export const DISCOVER_SKILLS_TOOL_NAME = 'discover_skills'

/**
 * discover_skills — 发现当前环境可用的技能清单。
 *
 * 此前 src/tools/DiscoverSkillsTool/prompt.ts 只有常量 DISCOVER_SKILLS_TOOL_NAME，
 * 目录下无实现文件（TASK.md #24：确为未实现）。
 *
 * 现复用三个已存在的技能发现函数：
 *   - getBundledSkills()      内置技能（已注册到 CLI 的命令）
 *   - getSkillDirCommands(cwd) 用户/托管/项目/插件外挂目录里的磁盘技能
 *   - getPluginSkills()       插件提供的技能
 *
 * 不引入任何 claude.ai / Anthropic 云依赖。纯本地扫描。
 */

const inputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .optional()
      .describe('可选过滤关键词：仅返回名称/描述/别名命中该子串的技能（大小写不敏感）'),
    source: z
      .enum(['all', 'bundled', 'dir', 'plugin'])
      .optional()
      .describe('按来源过滤：all（默认）/ bundled（内置）/ dir（磁盘目录）/ plugin（插件）'),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>

interface SkillSummary {
  name: string
  description: string
  aliases: string[]
  source: string
  sourcePath?: string
}

function toSummary(cmd: { name: string; description?: string; aliases?: string[]; loadedFrom?: string; source?: string; userInvocable?: boolean }, source: string): SkillSummary | null {
  // 仅暴露用户可直接调用的技能（isHidden / userInvocable=false 的不列入）
  if (cmd.userInvocable === false) return null
  return {
    name: cmd.name,
    description: cmd.description ?? '',
    aliases: cmd.aliases ?? [],
    source,
    sourcePath: cmd.loadedFrom,
  }
}

export async function collectSkills(cwd: string, query?: string, source: string = 'all'): Promise<SkillSummary[]> {
  const all: SkillSummary[] = []

  if (source === 'all' || source === 'bundled') {
    for (const cmd of getBundledSkills()) {
      const s = toSummary(cmd as never, 'bundled')
      if (s) all.push(s)
    }
  }

  if (source === 'all' || source === 'dir') {
    try {
      for (const cmd of await getSkillDirCommands(cwd)) {
        const s = toSummary(cmd as never, 'dir')
        if (s) all.push(s)
      }
    } catch {
      // 目录扫描失败不阻断其余来源
    }
  }

  if (source === 'all' || source === 'plugin') {
    try {
      for (const cmd of await getPluginSkills()) {
        const s = toSummary(cmd as never, 'plugin')
        if (s) all.push(s)
      }
    } catch {
      // 插件未启用 / 加载失败不阻断其余来源
    }
  }

  // 去重（同名技能优先级：bundled > dir > plugin 取首个）
  const seen = new Set<string>()
  const deduped: SkillSummary[] = []
  for (const s of all) {
    const key = s.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(s)
  }

  // 关键词过滤
  if (query && query.trim()) {
    const q = query.trim().toLowerCase()
    return deduped.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.aliases.some(a => a.toLowerCase().includes(q)),
    )
  }
  return deduped
}

export const DiscoverSkillsTool = buildTool({
  name: DISCOVER_SKILLS_TOOL_NAME,
  maxResultSizeChars: 100_000,
  description: async () =>
    '发现当前环境可用的技能（内置 / 磁盘目录 / 插件）。返回技能名称、描述、别名与来源。可传 query 关键词过滤。',
  callOn: 'manual',
  async prompt() {
    return '使用 discover_skills 工具列出当前可用的技能，或按关键词查找技能。'
  },
  get inputSchema() {
    return inputSchema()
  },
  userFacingName() {
    return 'discover_skills'
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput() {
    return ''
  },
  async checkPermissions() {
    return { behavior: 'allow', updatedInput: {} as Record<string, unknown> }
  },
  renderToolUseMessage(input) {
    const q = (input as Record<string, unknown>)?.query
    return `Discover skills${q ? ` (query: ${q})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (content as { summary?: string } | string) as string,
    }
  },
  async call({ query, source }: { query?: string; source?: 'all' | 'bundled' | 'dir' | 'plugin' }) {
    const skills = await collectSkills(process.cwd(), query, source ?? 'all')

    if (skills.length === 0) {
      return {
        data: {
          summary: query
            ? `未找到匹配「${query}」的技能。`
            : '当前环境未注册任何可用技能。',
          count: 0,
        },
      }
    }

    const lines = [
      `## 可用技能（${skills.length}）`,
      '',
      '| 名称 | 来源 | 描述 | 别名 |',
      '|------|------|------|------|',
      ...skills.map(s =>
        `| ${s.name} | ${s.source} | ${s.description.slice(0, 60).replace(/\|/g, '/')} | ${(s.aliases ?? []).join(', ') || '-'} |`,
      ),
    ]

    return {
      data: {
        summary: lines.join('\n'),
        count: skills.length,
        skills,
      },
    }
  },
} satisfies ToolDef<InputSchema, { summary: string; count: number; skills?: SkillSummary[] }>)
