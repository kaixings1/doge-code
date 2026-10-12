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
  recordIteration,
  saveGoal,
  transition,
  writeSessionAnchor,
} from '../../services/goal/goalState.js'
import { checkBudget } from '../../services/goal/budget.js'
import type { GoalState } from '../../services/goal/types.js'
import { addSessionHook, removeSessionHook } from '../../utils/hooks/sessionHooks.js'
import type { HookCommand } from '../../utils/settings/types.js'
import { GOAL_HOOK_MARKER, getGoalStopHookCommand } from './hookPath.js'

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

const SUBCOMMANDS = ['status', 'pause', 'resume', 'clear', 'history'] as const
type Subcommand = (typeof SUBCOMMANDS)[number]

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

function renderStatus(state: GoalState | null): string {
  if (!state) return '当前无活跃目标。用 `/goal <目标描述>` 设置一个。'

  const now = Date.now()
  const elapsed = fmtDuration(now - state.usage.startedAt)
  const iterLine = `${state.usage.iterations}/${state.budget.maxIterations}`
  const tokenLine =
    state.budget.tokenBudget > 0
      ? `${state.usage.tokenUsed}/${state.budget.tokenBudget}`
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

  return `# 🎯 目标状态

**目标**：${state.objective}
${state.criteria.length > 0 ? `**成功标准**：${state.criteria.join(' / ')}\n` : ''}**状态**：${state.status}
**迭代**：${iterLine}
**Token**：${tokenLine}
**运行时长**：${elapsed}
**墙钟预算**：${fmtBudget(state.budget.wallClockMs)}
**预算检查**：${budgetLine}
**最近裁判**：${judgeLine}

查看事件时间线：\`/goal history\``
}

function renderHistory(state: GoalState | null): string {
  if (!state) return '当前无活跃目标。'
  if (state.history.length === 0) return '（无事件记录）'
  const lines = state.history
    .slice(-30)
    .map(e => {
      const t = new Date(e.timestamp).toLocaleTimeString()
      const token = e.tokensThisTurn !== undefined ? ` [${e.tokensThisTurn} token]` : ''
      return `- ${t}  ${e.type}${token}  ${e.detail}`
    })
  return `# 📜 目标事件时间线（最近 ${lines.length} 条）\n\n${lines.join('\n')}`
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
