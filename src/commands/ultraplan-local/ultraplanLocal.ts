import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { LocalCommandCall } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'
import { getCwd } from '../../utils/cwd.js'

/**
 * 本地 Ultraplan — 对官方 CCR 云端版（最长 30 分钟、浏览器审批）的本地降级实现。
 *
 * 官方 /ultraplan 依赖 Claude Code 网页版：任务发到云端 CCR 会话，由 Opus 多 Agent
 * 探索，再在浏览器里人工审批。这里在没有官方服务时提供等价能力：
 *   1. 汇总本地计划目录与项目规划文档
 *   2. 输出结构化「深度规划」提示词，交给当前会话的模型执行
 *   3. `--list` 列出历史计划，`--show <slug>` 查看单个计划
 *
 * 不联网、不依赖 GrowthBook，纯本地。
 */

const MAX_FILE_BYTES = 256 * 1024

const PLAN_PROMPT_HEADER = `你正在进行一次"深度规划"（Ultraplan）。请在**不修改任何业务文件**的前提下产出一份可直接执行的实施计划。

要求：
1. 先确认目标与边界：这个任务要达成什么？明确不做哪些事？
2. 侦察现状：列出与任务相关的关键文件、入口、数据流（给出 file:line）。
3. 设计方案：给出 2-3 个候选方案及取舍，选定一个并说明理由。
4. 拆分步骤：每步都是可独立验证的最小改动，标注涉及文件。
5. 风险与验证：指出最容易出错的点，以及每步如何验证。
6. 最后用"待确认问题"列出需要我拍板的点；如果没有，写"无"。

把计划写入计划目录，然后在对话中给出摘要。
`

interface PlanFile {
  slug: string
  path: string
  mtimeMs: number
  size: number
}

/**
 * 计划目录：与 utils/plans.ts 的默认值一致（配置根 /plans）。
 * 这里不 import getPlansDirectory —— 那条链路会连带拉进 bootstrap 状态
 * 与大量运行时模块，对一个只读命令来说太重；显式保留同一默认值即可。
 */
function plansDir(): string {
  const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.doge'), 'plans')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // 目录不可写时后续 readdir 会自然返回空
  }
  return dir
}

function listPlanFiles(): PlanFile[] {
  const dir = plansDir()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: PlanFile[] = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const full = join(dir, name)
    try {
      const st = statSync(full)
      if (!st.isFile()) continue
      out.push({ slug: name.slice(0, -3), path: full, mtimeMs: st.mtimeMs, size: st.size })
    } catch {
      // 文件在扫描期间消失，忽略
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return out
}

function readPlanSafe(file: string): string {
  try {
    const buf = readFileSync(file)
    if (buf.length > MAX_FILE_BYTES) {
      return buf.subarray(0, MAX_FILE_BYTES).toString('utf8') + `\n\n…（已截断，共 ${buf.length} 字节）`
    }
    return buf.toString('utf8')
  } catch {
    return ''
  }
}

/** 收集项目里可作为规划素材的文档（只读）。 */
function collectProjectDocs(): string[] {
  const cwd = getCwd()
  const candidates = [
    'TASK.md',
    'PLANNING.md',
    'CLAUDE.md',
    'README.md',
    'AGENTS.md',
    'PLAN.md',
    'docs/PLAN.md',
    'docs/ROADMAP.md',
  ]
  const out: string[] = []
  for (const rel of candidates) {
    const full = join(cwd, rel)
    if (!existsSync(full)) continue
    const text = readPlanSafe(full)
    if (!text.trim()) continue
    out.push(`### ${rel}\n\n${text.slice(0, 8000)}`)
  }
  return out
}

function formatList(): string {
  const files = listPlanFiles()
  if (files.length === 0) {
    return `本地暂无历史计划。\n计划目录: ${plansDir()}\n\n用法: /ultraplan-local <任务描述> 生成深度计划。`
  }
  const lines = files.slice(0, 20).map((f, i) => {
    const when = new Date(f.mtimeMs).toISOString().replace('T', ' ').slice(0, 19)
    return `${String(i + 1).padStart(2)}. ${f.slug.padEnd(24)} ${when}  ${f.size}B`
  })
  return [`本地历史计划 (${files.length} 个):`, ...lines, '', `目录: ${plansDir()}`].join('\n')
}

function formatShow(slug: string): string {
  const files = listPlanFiles()
  const hit = files.find(f => f.slug === slug) ?? files.find(f => f.slug.includes(slug))
  if (!hit) {
    return `未找到计划「${slug}」。可用 /ultraplan-local --list 查看。`
  }
  return [`计划: ${hit.slug}`, `路径: ${hit.path}`, '', readPlanSafe(hit.path)].join('\n')
}

const call: LocalCommandCall = async (args, _context) => {
  const trimmed = args.trim()

  if (!trimmed || trimmed === '--list' || trimmed === 'list') {
    return { type: 'text', value: formatList() }
  }

  const showMatch = trimmed.match(/^(?:--show|-s)\s+(.+)$/)
  if (showMatch) {
    return { type: 'text', value: formatShow(showMatch[1].trim()) }
  }

  const dir = plansDir()
  const docs = collectProjectDocs()

  const parts: string[] = [PLAN_PROMPT_HEADER, '']
  parts.push(`## 任务\n\n${trimmed}`, '')
  parts.push(`## 上下文\n\n工作目录: ${getCwd()}\n计划目录: ${dir}\n会话: ${getSessionId()}`, '')

  if (docs.length > 0) {
    parts.push('## 项目文档', '', ...docs, '')
  } else {
    parts.push('## 项目文档', '', '（未找到 TASK.md / PLANNING.md / CLAUDE.md 等规划文档）', '')
  }

  const recent = listPlanFiles().slice(0, 5)
  if (recent.length > 0) {
    parts.push('## 最近的历史计划（参考，避免重复已否决的方案）', '')
    for (const f of recent) {
      parts.push(`### ${f.slug}`, '', readPlanSafe(f.path).slice(0, 2000), '')
    }
  }

  parts.push(
    '## 产出要求',
    '',
    `- 把最终计划写入计划目录（${dir}），文件名使用简短英文 slug`,
    '- 计划必须包含：目标、现状、方案对比、分步实施、验证方式、待确认问题',
    '- 不要在规划阶段修改业务代码',
  )

  return { type: 'text', value: parts.join('\n') }
}

export { call, formatList, formatShow, listPlanFiles }
