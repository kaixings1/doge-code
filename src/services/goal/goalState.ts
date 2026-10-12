/**
 * /goal 状态层 — GoalState 的持久化与生命周期管理
 *
 * 三层存储（见 goal.md §2.2）：
 * - Layer 1：内存对象（本模块返回的 GoalState 实例）
 * - Layer 2：项目级状态文件 .claude/goals/active.json（原子写）
 * - Layer 3：会话锚点 .claude/goals/sessions/<sessionId>.id
 *
 * 恢复时机：命令入口 / SessionStart 调用 loadGoal()（不依赖对话记忆）。
 */

import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import * as path from 'path'
import {
  DEFAULT_BUDGET,
  type GoalBudget,
  type GoalEvent,
  type GoalEventType,
  type GoalState,
  type GoalStatus,
} from './types.js'

/** goals 目录相对于 cwd 的位置 */
const GOALS_DIR = path.join('.claude', 'goals')
const ACTIVE_FILE = 'active.json'

function goalsDir(cwd: string): string {
  return path.join(cwd, GOALS_DIR)
}

function activeFile(cwd: string): string {
  return path.join(goalsDir(cwd), ACTIVE_FILE)
}

function sessionsDir(cwd: string): string {
  return path.join(goalsDir(cwd), 'sessions')
}

/** 原子写：先写 .tmp 再 rename，避免写入中途崩溃损坏状态 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.tmp`
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, filePath)
}

/** 读取项目级 GoalState；文件不存在或损坏返回 null */
export async function loadGoal(cwd: string): Promise<GoalState | null> {
  try {
    const raw = await fs.readFile(activeFile(cwd), 'utf-8')
    const parsed = JSON.parse(raw) as GoalState
    if (!parsed || typeof parsed.objective !== 'string') return null
    // 向后兼容：补齐缺失字段
    parsed.criteria ??= []
    parsed.budget ??= { ...DEFAULT_BUDGET }
    parsed.usage ??= {
      iterations: 0,
      tokenUsed: 0,
      startedAt: Date.now(),
      lastIterationAt: Date.now(),
    }
    parsed.history ??= []
    return parsed
  } catch {
    return null
  }
}

/** 持久化 GoalState（自动更新 updatedAt） */
export async function saveGoal(cwd: string, state: GoalState): Promise<void> {
  state.updatedAt = Date.now()
  await atomicWrite(activeFile(cwd), JSON.stringify(state, null, 2))
}

/** 删除项目级状态文件与当前会话锚点 */
export async function clearGoal(cwd: string, sessionId?: string): Promise<void> {
  try {
    await fs.unlink(activeFile(cwd))
  } catch {
    /* 文件不存在，忽略 */
  }
  if (sessionId) {
    try {
      await fs.unlink(path.join(sessionsDir(cwd), `${sessionId}.id`))
    } catch {
      /* 忽略 */
    }
  }
}

/** 写入会话锚点：记录本会话绑定的 goal id（多会话隔离） */
export async function writeSessionAnchor(
  cwd: string,
  sessionId: string,
  goalId: string,
): Promise<void> {
  const dir = sessionsDir(cwd)
  await fs.mkdir(dir, { recursive: true })
  await atomicWrite(path.join(dir, `${sessionId}.id`), goalId)
}

/** 创建新 GoalState（不落盘，由调用方 saveGoal） */
export function createGoal(
  objective: string,
  options?: { criteria?: string[]; budget?: Partial<GoalBudget> },
): GoalState {
  const now = Date.now()
  const state: GoalState = {
    id: randomUUID(),
    objective: objective.trim(),
    criteria: options?.criteria ?? [],
    status: 'active',
    budget: { ...DEFAULT_BUDGET, ...(options?.budget ?? {}) },
    usage: {
      iterations: 0,
      tokenUsed: 0,
      startedAt: now,
      lastIterationAt: now,
    },
    history: [],
    createdAt: now,
    updatedAt: now,
  }
  appendEvent(state, 'set', `目标已设置：${state.objective}`)
  return state
}

/** 追加一条审计事件 */
export function appendEvent(
  state: GoalState,
  type: GoalEventType,
  detail: string,
  tokensThisTurn?: number,
): GoalEvent {
  const event: GoalEvent = {
    type,
    timestamp: Date.now(),
    detail,
    ...(tokensThisTurn !== undefined ? { tokensThisTurn } : {}),
  }
  state.history.push(event)
  state.updatedAt = event.timestamp
  return event
}

/** 状态转换：仅允许合法迁移，返回是否成功 */
export function transition(
  state: GoalState,
  next: GoalStatus,
  eventType: GoalEventType,
  detail: string,
): boolean {
  const legal = LEGAL_TRANSITIONS[state.status] ?? []
  if (state.status !== next && !legal.includes(next)) return false
  state.status = next
  if (next === 'complete' || next === 'impossible') {
    state.completedAt = Date.now()
  }
  appendEvent(state, eventType, detail)
  return true
}

/** 合法状态迁移表（goal.md §3.1 边界条件的落地） */
const LEGAL_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  active: ['paused', 'budget_limited', 'complete', 'impossible', 'error'],
  paused: ['active'],
  budget_limited: ['active'],
  complete: [],
  impossible: [],
  error: ['active'],
}

/** 记录一轮迭代结束 */
export function recordIteration(
  state: GoalState,
  tokensThisTurn: number,
  detail: string,
): void {
  state.usage.iterations += 1
  state.usage.tokenUsed += tokensThisTurn
  state.usage.lastIterationAt = Date.now()
  appendEvent(state, 'iteration_end', detail, tokensThisTurn)
}
