/**
 * /goal — 命令实现（LocalJSXCommand）
 *
 * 五子命令：set / status / pause / resume / clear / history
 *
 * 说明：
 * - 状态层：src/services/goal/goalState.ts
 * - 预算层：src/services/goal/budget.ts
 * - 裁判与 Stop hook 注册：见 goal.md §2.3 / §3.2（阶段三接入）
 */

import type { LocalJSXCommandCall } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { getSessionId } from '../../bootstrap/state.js'
import {
  clearGoal,
  createGoal,
  loadGoal,
  appendEvent,
  saveGoal,
  transition,
  writeSessionAnchor,
} from '../../services/goal/goalState.js'
import { checkBudget } from '../../services/goal/budget.js'
import { progressBar } from '../loop/progress-ui.js'
import type { GoalState } from '../../services/goal/types.js'
import { addSessionHook, removeSessionHook } from '../../utils/hooks/sessionHooks.js'
import type { HookCommand } from '../../utils/settings/types.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import {
  getGoalSessionStartHookCommand,
  getGoalStopHookCommand,
} from './hookPath.js'

/** 构造 goal 的 Stop hook 命令对象（command 型，执行裁判脚本） */
function buildGoalStopHook(): HookCommand {
  return {
    type: 'command',
    command: getGoalStopHookCommand(),
    timeout: 60,
    statusMessage: '评估目标是否达成',
  }
}

/** 注册 Stop hook（幂等：先移除同标识的旧 hook 再添加） */
function registerGoalStopHook(
  setAppState: Parameters<typeof addSessionHook>[0],
  sessionId: string,
): void {
  try {
    removeSessionHook(setAppState, sessionId, 'Stop', buildGoalStopHook())
  } catch {
    /* 旧 hook 不存在，忽略 */
  }
  addSessionHook(setAppState, sessionId, 'Stop', '', buildGoalStopHook())
}

/** 移除 Stop hook */
function unregisterGoalStopHook(
  setAppState: Parameters<typeof removeSessionHook>[0],
  sessionId: string,
): void {
  try {
    removeSessionHook(setAppState, sessionId, 'Stop', buildGoalStopHook())
  } catch {
    /* 忽略 */
  }
}

const SUBCOMMANDS = [
  'status',
  'pause',
  'resume',
  'clear',
  'history',
  'install-hook',
  'uninstall-hook',
] as const
type Subcommand = (typeof SUBCOMMANDS)[number]

/**
 * 将 SessionStart hook 写入项目 .claude/settings.json。
 *
 * 用途：/clear 后新会话启动时，若存在活跃目标则给出恢复提示。
 * 该 hook 必须持久化（会话内注册随 sessionId 变更失效），故写 settings.json，
 * 且仅在用户显式执行本子命令时写入，不自动改动用户配置。
 */
function installSessionStartHook(): string {
  const command = getGoalSessionStartHookCommand()
  const settings = getSettingsForSource('projectSettings') ?? {}
  const hookEntry = {
    matcher: 'clear',
    hooks: [{ type: 'command' as const, command, timeout: 10 }],
  }
  const existing = (settings.hooks?.SessionStart ?? []) as Array<{
    hooks?: Array<{ command?: string }>
  }>
  const already = existing.some(m =>
    (m.hooks ?? []).some(h => typeof h.command === 'string' && h.command.includes('goal-sessionstart-hook')),
  )
  if (already) {
    return 'ℹ️ SessionStart hook 已安装（.claude/settings.json）。'
  }

  const { error } = updateSettingsForSource('projectSettings', {
    ...settings,
    hooks: {
      ...(settings.hooks ?? {}),
      SessionStart: [...existing, hookEntry],
    },
  } as typeof settings)
  if (error) return `❌ 安装失败：${error.message}`
  return `✅ 已安装 SessionStart hook 到 .claude/settings.json。\n/clear 后若存在活跃目标会给出恢复提示。`
}

/** 从项目 settings.json 移除 goal 的 SessionStart hook */
function uninstallSessionStartHook(): string {
  const settings = getSettingsForSource('projectSettings') ?? {}
  const existing = (settings.hooks?.SessionStart ?? []) as Array<{
    hooks?: Array<{ command?: string }>
  }>
  const filtered = existing.filter(
    m =>
      !(m.hooks ?? []).some(
        h => typeof h.command === 'string' && h.command.includes('goal-sessionstart-hook'),
      ),
  )
  if (filtered.length === existing.length) {
    return 'ℹ️ 未发现 goal 的 SessionStart hook。'
  }
  const nextHooks = { ...(settings.hooks ?? {}) }
  if (filtered.length > 0) {
    nextHooks.SessionStart = filtered as (typeof nextHooks)['SessionStart']
  } else {
    delete nextHooks.SessionStart
  }
  const { error } = updateSettingsForSource('projectSettings', {
    ...settings,
    hooks: nextHooks,
  } as typeof settings)
  if (error) return `❌ 卸载失败：${error.message}`
  return '✅ 已从 .claude/settings.json 移除 SessionStart hook。'
}

function renderHelp(): string {
  return `# /goal — 目标自治运行时

给会话设置一个成功条件，由裁判（Stop hook）每轮评估，未达成则自动继续推进，
直到达成 / 判定不可能 / 预算耗尽。

## 用法
  /goal <目标描述> [选项]      设置新目标并开始执行
  /goal status                查看当前目标与进度
  /goal pause                 暂停当前目标
  /goal resume                恢复已暂停的目标
  /goal history               查看目标事件时间线
  /goal clear                 清除当前目标
  /goal install-hook          安装 SessionStart hook（/clear 后恢复提示）
  /goal uninstall-hook        移除上述 hook

## 选项（设置目标时）
  --criteria <标准>           成功标准（可多次指定）
  --max-iterations <N>        最大迭代次数（默认 50）
  --budget <时长>             墙钟预算，如 30m / 2h / 4h（默认 4h）
  --token-budget <N>          token 预算（0 = 不限制）

## 示例
  /goal "让 npm test 全部通过" --criteria "测试 0 失败"
  /goal "重构 utils 并跑通 lint" --max-iterations 30 --budget 1h
  /goal status`
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${sec}s`
  return `${sec}s`
}

function fmtBudget(ms: number): string {
  if (ms <= 0) return '不限制'
  return fmtDuration(ms)
}

/** 状态徽标 */
export function statusBadge(status: GoalState['status']): string {
  switch (status) {
    case 'active':
      return '🟢 active'
    case 'paused':
      return '⏸️ paused'
    case 'budget_limited':
      return '💸 budget_limited'
    case 'complete':
      return '✅ complete'
    case 'impossible':
      return '⛔ impossible'
    case 'error':
      return '❌ error'
    default:
      return status
  }
}

export function renderStatus(state: GoalState | null): string {
  if (!state) return '当前无活跃目标。用 `/goal <目标描述>` 设置一个。'

  const now = Date.now()
  const elapsed = fmtDuration(now - state.usage.startedAt)
  const iterBar = progressBar(state.usage.iterations, state.budget.maxIterations)
  const tokenLine =
    state.budget.tokenBudget > 0
      ? `${state.usage.tokenUsed}/${state.budget.tokenBudget} ${progressBar(
          state.usage.tokenUsed,
          state.budget.tokenBudget,
        )}`
      : `${state.usage.tokenUsed}（不限制）`

  const judge = state.lastJudge
  const judgeLine = judge
    ? judge.ok
      ? `✅ 已达成 — ${judge.reason}`
      : judge.impossible
        ? `⛔ 判定不可能 — ${judge.reason}`
        : `⏳ 未达成 — ${judge.reason}`
    : '（尚未评估）'

  const budget = checkBudget(state, now)
  const budgetLine = budget.exceeded ? `⚠️ ${budget.reason}` : '正常'

  const wallMs = state.budget.wallClockMs
  const wallLine =
    wallMs > 0
      ? `${elapsed} / ${fmtBudget(wallMs)} ${progressBar(now - state.usage.startedAt, wallMs)}`
      : '不限制'

  const judgeCount = state.history.filter(e => e.type.startsWith('judge_')).length
  const sinceLast = state.usage.lastIterationAt
    ? `（上次 ${fmtDuration(now - state.usage.lastIterationAt)} 前）`
    : ''

  return `# 🎯 目标状态

**目标**：${state.objective}
${state.criteria.length > 0 ? `**成功标准**：${state.criteria.join(' / ')}\n` : ''}**状态**：${statusBadge(state.status)}

**迭代**：${iterBar} ${state.usage.iterations}/${state.budget.maxIterations} ${sinceLast}
**Token**：${tokenLine}
**运行时长**：${elapsed}
**墙钟预算**：${wallLine}
**预算检查**：${budgetLine}
**裁判次数**：${judgeCount}
**最近裁判**：${judgeLine}

查看事件时间线：\`/goal history\``
}

/** 事件类型 -> 显示图标 */
export function eventIcon(type: string): string {
  if (type === 'judge_ok') return '✅'
  if (type === 'judge_not_ok') return '⏳'
  if (type === 'judge_impossible') return '⛔'
  if (type === 'budget_exceeded') return '💸'
  if (type === 'circuit_break') return '🔌'
  if (type === 'error') return '❌'
  if (type === 'set') return '🎯'
  if (type === 'pause') return '⏸️'
  if (type === 'resume') return '▶️'
  if (type === 'clear') return '🗑️'
  if (type === 'iteration_end') return '🔁'
  return '•'
}

export function renderHistory(state: GoalState | null): string {
  if (!state) return '当前无活跃目标。'
  if (state.history.length === 0) return '（无事件记录）'

  // 按事件类型汇总统计
  const counts = new Map<string, number>()
  let totalTokens = 0
  for (const e of state.history) {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    if (e.tokensThisTurn) totalTokens += e.tokensThisTurn
  }
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${eventIcon(t)} ${t}×${n}`)
    .join('  ')

  const shown = state.history.slice(-30)
  const lines = shown.map(e => {
    const t = new Date(e.timestamp).toLocaleTimeString()
    const token = e.tokensThisTurn != null ? ` [${e.tokensThisTurn} token]` : ''
    const detail = e.detail.length > 80 ? e.detail.slice(0, 80) + '…' : e.detail
    return `- ${t}  ${eventIcon(e.type)} ${e.type}${token}  ${detail}`
  })

  return `# 📜 目标事件审计（共 ${state.history.length} 条，显示最近 ${lines.length} 条）

**汇总**：${summary || '（无）'}
**本轮累计 token**：${totalTokens}
**usage.tokenUsed**：${state.usage.tokenUsed}

## 时间线
${lines.join('\n')}`
}

/** 解析 --budget 时长：支持 30s / 5m / 2h */
function parseDuration(s: string): number | null {
  const m = /^(\d+)\s*(s|m|h)?$/i.exec(s.trim())
  if (!m) return null
  const n = Number(m[1])
  const unit = (m[2] ?? 'm').toLowerCase()
  const mul = unit === 's' ? 1000 : unit === 'h' ? 3600_000 : 60_000
  return n * mul
}

interface SetOptions {
  criteria: string[]
  maxIterations?: number
  wallClockMs?: number
  tokenBudget?: number
}

/** 解析设置目标时的选项（--criteria 可重复） */
function parseSetArgs(tokens: string[]): { objective: string; options: SetOptions } {
  const criteria: string[] = []
  let maxIterations: number | undefined
  let wallClockMs: number | undefined
  let tokenBudget: number | undefined
  const objectiveParts: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t === '--criteria') {
      const v = tokens[++i]
      if (v) criteria.push(v)
    } else if (t === '--max-iterations') {
      const v = Number(tokens[++i])
      if (Number.isFinite(v) && v > 0) maxIterations = v
    } else if (t === '--budget') {
      const v = tokens[++i]
      const ms = v ? parseDuration(v) : null
      if (ms !== null) wallClockMs = ms
    } else if (t === '--token-budget') {
      const v = Number(tokens[++i])
      if (Number.isFinite(v) && v >= 0) tokenBudget = v
    } else {
      objectiveParts.push(t)
    }
  }

  return {
    objective: objectiveParts.join(' ').trim(),
    options: { criteria, maxIterations, wallClockMs, tokenBudget },
  }
}

/** 简易分词：支持引号 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur)
        cur = ''
      }
      continue
    }
    cur += ch
  }
  if (cur) tokens.push(cur)
  return tokens
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const cwd = getCwd()
  const sessionId = getSessionId()
  const raw = (args ?? '').trim()

  // 无参数：显示帮助 + 当前状态
  if (!raw) {
    const state = await loadGoal(cwd)
    onDone(`${renderHelp()}\n\n---\n\n${renderStatus(state)}`)
    return null
  }

  const tokens = tokenize(raw)
  const first = tokens[0]?.toLowerCase()

  // 子命令分发
  if (first === 'help' || first === '--help' || first === '-h') {
    onDone(renderHelp())
    return null
  }

  const setAppState = context.setAppState
  const sessionIdForHooks = context.agentId ?? sessionId

  // 自愈：/clear 会 regenerateSessionId()，使本会话内已注册的 Stop hook 失效
  // （会话 hook 以旧 sessionId 为键，内存态），但项目级 active.json 仍在。
  // 此处若发现活跃目标，幂等重注册 Stop hook，避免"僵尸目标"（状态在但无裁判驱动）。
  // set/resume 分支内部也会注册，重复无副作用（registerGoalStopHook 幂等）。
  if (first !== 'clear' && first !== 'pause') {
    const current = await loadGoal(cwd)
    if (current && current.status === 'active') {
      registerGoalStopHook(setAppState, sessionIdForHooks)
    }
  }

  if (SUBCOMMANDS.includes(first as Subcommand)) {
    await handleSubcommand(first as Subcommand, cwd, sessionId, setAppState, sessionIdForHooks, onDone)
    return null
  }

  // 否则视为设置新目标
  await handleSet(raw, cwd, sessionId, setAppState, sessionIdForHooks, onDone)
  return null
}

async function handleSubcommand(
  sub: Subcommand,
  cwd: string,
  sessionId: string,
  setAppState: Parameters<typeof addSessionHook>[0],
  hookSessionId: string,
  onDone: (msg: string) => void,
): Promise<void> {
  const state = await loadGoal(cwd)

  switch (sub) {
    case 'status':
      onDone(renderStatus(state))
      return

    case 'history':
      onDone(renderHistory(state))
      return

    case 'install-hook': {
      onDone(installSessionStartHook())
      return
    }

    case 'uninstall-hook': {
      onDone(uninstallSessionStartHook())
      return
    }

    case 'pause': {
      if (!state) return onDone('当前无活跃目标。')
      if (state.status !== 'active') {
        return onDone(`目标当前状态为 ${state.status}，无法暂停。`)
      }
      transition(state, 'paused', 'pause', '用户暂停')
      await saveGoal(cwd, state)
      unregisterGoalStopHook(setAppState, hookSessionId)
      onDone('⏸️ 目标已暂停。用 `/goal resume` 恢复。')
      return
    }

    case 'resume': {
      if (!state) return onDone('当前无活跃目标。')
      if (state.status !== 'paused' && state.status !== 'budget_limited') {
        return onDone(`目标当前状态为 ${state.status}，无法恢复。`)
      }
      transition(state, 'active', 'resume', '用户恢复')
      state.usage.lastIterationAt = Date.now()
      // 恢复时重置墙钟起点，避免恢复后立刻又超时
      state.usage.startedAt = Date.now()
      await saveGoal(cwd, state)
      registerGoalStopHook(setAppState, hookSessionId)
      onDone('▶️ 目标已恢复，将继续推进。')
      return
    }

    case 'clear': {
      if (!state) return onDone('当前无活跃目标。')
      await clearGoal(cwd, sessionId)
      unregisterGoalStopHook(setAppState, hookSessionId)
      onDone('🗑️ 目标已清除。')
      return
    }
  }
}

async function handleSet(
  raw: string,
  cwd: string,
  sessionId: string,
  setAppState: Parameters<typeof addSessionHook>[0],
  hookSessionId: string,
  onDone: (msg: string, opts?: { shouldQuery?: boolean; metaMessages?: string[] }) => void,
): Promise<void> {
  const { objective, options } = parseSetArgs(tokenize(raw))

  if (!objective) {
    onDone('❌ 目标描述不能为空。\n\n' + renderHelp())
    return
  }

  const existing = await loadGoal(cwd)

  const goal = createGoal(objective, {
    criteria: options.criteria,
    budget: {
      ...(options.maxIterations !== undefined ? { maxIterations: options.maxIterations } : {}),
      ...(options.wallClockMs !== undefined ? { wallClockMs: options.wallClockMs } : {}),
      ...(options.tokenBudget !== undefined ? { tokenBudget: options.tokenBudget } : {}),
    },
  })

  if (existing && existing.status === 'active') {
    appendEvent(goal, 'set', `替换原目标（原状态 ${existing.status}）`)
  }

  await saveGoal(cwd, goal)
  await writeSessionAnchor(cwd, sessionId, goal.id)

  // 注册 Stop hook：每轮结束后由裁判评估是否达成
  registerGoalStopHook(setAppState, hookSessionId)

  const critLine =
    goal.criteria.length > 0 ? `\n**成功标准**：${goal.criteria.join(' / ')}` : ''
  const budgetLine = `**预算**：最多 ${goal.budget.maxIterations} 轮 / ${fmtBudget(goal.budget.wallClockMs)}${
    goal.budget.tokenBudget > 0 ? ` / ${goal.budget.tokenBudget} token` : ''
  }`

  const message = `# 🎯 目标已设置

**目标**：${goal.objective}${critLine}
${budgetLine}

裁判将在每轮结束后评估是否达成。查看进度：\`/goal status\``

  // shouldQuery 触发主模型开始第一轮
  onDone(message, {
    shouldQuery: true,
    metaMessages: [
      `[goal] 已设置目标：${goal.objective}${
        goal.criteria.length > 0 ? `（成功标准：${goal.criteria.join('；')}）` : ''
      }。请开始推进该目标，并在过程中持续工作直到目标达成。`,
    ],
  })
}
