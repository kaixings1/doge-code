/**
 * Loop Task Planner (B1)
 *
 * 任务规划器 — 将复杂目标自动分解为带依赖的子任务 DAG。
 *
 * - decomposeToDag: 目标 → 分阶段子任务（理解→设计→实现→测试→验证→文档），带依赖链
 * - topoSort: Kahn 拓扑排序，保证执行顺序满足依赖
 * - getReadyTasks: 选取"依赖已满足"的待执行任务（支持并行度与优先级）
 * - hasCycle / formatPlan: 环检测与人类可读计划
 */

import type { LoopGoal, SubTask } from './types.js'

/** 阶段模板 — 每个阶段的前置依赖 */
interface PhaseTemplate {
  id: string
  label: string
  description: string
  dependsOn: string[]
}

/** 标准软件工程阶段（核心闭环） */
const CORE_PHASES: PhaseTemplate[] = [
  { id: 'understand', label: '理解需求', description: '分析目标，明确输入/输出、约束与成功标准', dependsOn: [] },
  { id: 'design', label: '设计架构', description: '规划文件结构、模块划分与关键接口', dependsOn: ['understand'] },
  { id: 'implement', label: '实现功能', description: '编写核心代码与配置文件', dependsOn: ['design'] },
  { id: 'test', label: '编写测试', description: '为关键逻辑添加单元测试并运行', dependsOn: ['implement'] },
  { id: 'verify', label: '验证构建', description: '运行类型检查/构建/测试，确认无回归', dependsOn: ['test', 'implement'] },
  { id: 'document', label: '完善文档', description: '补充 README 与使用说明', dependsOn: ['implement'] },
]

let taskSeq = 0

function nextId(prefix: string): string {
  taskSeq++
  return `${prefix}-${taskSeq.toString(36)}`
}

/**
 * 解析阶段依赖：优先取本次分解中已存在的依赖；
 * 若全部依赖阶段被跳过（如简单目标无 design/test 阶段），
 * 则回退到最近已添加的阶段，保持串行链不断裂。
 */
function buildDeps(
  phase: PhaseTemplate,
  idMap: Map<string, SubTask>,
  subTasks: SubTask[],
): string[] {
  let deps = phase.dependsOn
    .filter(dep => idMap.has(dep))
    .map(dep => idMap.get(dep)!.id)
  if (deps.length === 0 && phase.dependsOn.length > 0 && subTasks.length > 0) {
    const last = subTasks[subTasks.length - 1]
    if (last) deps = [last.id]
  }
  return deps
}

/**
 * 将目标分解为带依赖的 DAG 子任务。
 *
 * - 目标已显式提供 subTasks 时：规范化（补齐 id / 校验依赖 / 去环）
 * - 否则：按目标关键词选择阶段，形成标准 DAG
 */
export function decomposeToDag(goal: LoopGoal): SubTask[] {
  if (goal.subTasks && goal.subTasks.length > 0) {
    return normalizeSubtasks(goal.subTasks)
  }

  const g = goal.description.toLowerCase()
  const phases: PhaseTemplate[] = []

  // 简单/探索性目标：缩减为 3 阶段，避免开销
  const isSimple = g.length < 24 && !/测试|文档|重构|修复|部署|服务器|api/.test(g)
  if (isSimple) {
    phases.push(CORE_PHASES[0], CORE_PHASES[2], CORE_PHASES[4])
  } else {
    for (const p of CORE_PHASES) phases.push(p)
  }

  // 关键词追加/保留阶段
  if (!/测试|test/.test(g) && !isSimple) {
    // 无测试关键词时仍保留 test（自主闭环默认要求验证）
  }
  if (/文档|readme|说明|document/.test(g) && !phases.some(p => p.id === 'document')) {
    phases.push(CORE_PHASES[5])
  }

  const subTasks: SubTask[] = []
  const idMap = new Map<string, SubTask>()

  for (const phase of phases) {
    if (idMap.has(phase.id)) continue
    const id = nextId('task')
    const task: SubTask = {
      id,
      description: `${phase.label}：${phase.description}（目标：${goal.description.slice(0, 60)}${goal.description.length > 60 ? '…' : ''}）`,
      status: 'pending',
      dependencies: buildDeps(phase, idMap, subTasks),
      verify: phase.id === 'verify' ? '运行类型检查与构建，确认无错误' : undefined,
      priority: phase.id === 'implement' ? 10 : phase.id === 'verify' ? 8 : 5,
    }
    idMap.set(phase.id, task)
    subTasks.push(task)
  }

  return subTasks
}

/**
 * 规范化显式提供的子任务：
 * - 补齐缺失 id
 * - 剔除不存在的依赖
 * - 检测环，若存在则断开（移除环上的依赖，退化串行）
 */
export function normalizeSubtasks(subTasks: SubTask[]): SubTask[] {
  if (subTasks.length === 0) return subTasks

  const ids = new Set<string>()
  const normalized: SubTask[] = []

  for (const t of subTasks) {
    const id = t.id || nextId('task')
    ids.add(id)
    normalized.push({ ...t, id, status: t.status || 'pending' })
  }

  // 剔除不存在/自引用的依赖
  for (const t of normalized) {
    if (!t.dependencies) continue
    t.dependencies = t.dependencies.filter(dep => dep !== t.id && ids.has(dep))
  }

  // 环检测 → 断开环
  let cycleCount = 0
  while (hasCycle(normalized) && cycleCount < 10) {
    // 简单策略：移除 id 最大的依赖（后续节点），破坏环
    for (const t of normalized) {
      if (t.dependencies && t.dependencies.length > 0) {
        t.dependencies.pop()
        cycleCount++
        if (!hasCycle(normalized)) break
      }
    }
    cycleCount++
  }

  return normalized
}

/**
 * Kahn 拓扑排序。返回按依赖顺序排列的任务 id 列表。
 * 存在环时返回 null（调用方应使用 normalizeSubtasks 预清理）。
 */
export function topoSort(subTasks: SubTask[]): string[] | null {
  const indegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  const nodes = new Set<string>()

  for (const t of subTasks) {
    nodes.add(t.id)
    if (!indegree.has(t.id)) indegree.set(t.id, 0)
    if (!adj.has(t.id)) adj.set(t.id, [])
  }

  for (const t of subTasks) {
    for (const dep of t.dependencies ?? []) {
      if (!nodes.has(dep)) continue
      adj.get(dep)!.push(t.id)
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1)
    }
  }

  // 稳定队列：按 indegree 升序，同 indegree 按 id 字典序（确定性输出）
  const queue = [...nodes]
    .filter(n => (indegree.get(n) ?? 0) === 0)
    .sort()

  const result: string[] = []
  while (queue.length > 0) {
    const node = queue.shift()!
    result.push(node)
    for (const next of (adj.get(node) ?? []).sort()) {
      const deg = (indegree.get(next) ?? 0) - 1
      indegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
    queue.sort()
  }

  if (result.length !== nodes.size) return null
  return result
}

/**
 * 返回当前可执行的待办任务：
 * - status === 'pending'
 * - 所有 dependencies 均已完成
 * - 按 priority 降序、id 升序稳定排序
 * - 截取前 limit 个（并行度）
 */
export function getReadyTasks(subTasks: SubTask[], limit: number): SubTask[] {
  const statusById = new Map(subTasks.map(t => [t.id, t.status]))

  const ready = subTasks.filter(t => {
    if (t.status !== 'pending') return false
    return (t.dependencies ?? []).every(dep => statusById.get(dep) === 'completed')
  })

  ready.sort((a, b) => {
    const pa = a.priority ?? 0
    const pb = b.priority ?? 0
    if (pb !== pa) return pb - pa
    return a.id.localeCompare(b.id)
  })

  return ready.slice(0, Math.max(1, limit))
}

/**
 * 检测依赖环（DFS 三色标记法）
 */
export function hasCycle(subTasks: SubTask[]): boolean {
  const status = new Map<string, 0 | 1 | 2>() // 0=未访问 1=访问中 2=已完成
  const adj = new Map<string, string[]>()

  for (const t of subTasks) {
    status.set(t.id, 0)
    adj.set(t.id, t.dependencies ?? [])
  }

  const visit = (id: string): boolean => {
    const s = status.get(id)
    if (s === 1) return true // 回边 → 环
    if (s === 2) return false
    status.set(id, 1)
    for (const dep of adj.get(id) ?? []) {
      if (visit(dep)) return true
    }
    status.set(id, 2)
    return false
  }

  for (const t of subTasks) {
    if (status.get(t.id) === 0 && visit(t.id)) return true
  }
  return false
}

/**
 * 生成人类可读的执行计划（按拓扑顺序）
 */
export function formatPlan(subTasks: SubTask[]): string {
  const order = topoSort(subTasks) ?? subTasks.map(t => t.id)
  const byId = new Map(subTasks.map(t => [t.id, t]))

  const lines = ['## 📋 任务计划（DAG）', '']
  const depth = new Map<string, number>()

  // 计算每个节点的深度（最长依赖链长度）用于缩进
  for (const id of order) {
    const t = byId.get(id)!
    const deps = (t.dependencies ?? []).map(d => depth.get(d) ?? 0)
    depth.set(id, deps.length > 0 ? Math.max(...deps) + 1 : 0)
  }

  order.forEach((id, i) => {
    const t = byId.get(id)!
    const depNames = (t.dependencies ?? [])
      .map(d => byId.get(d)?.description.slice(0, 12) ?? d)
    const depNote = depNames.length > 0 ? `（依赖: ${depNames.join(', ')}）` : ''
    const verifyNote = t.verify ? ' [验证]' : ''
    const prioNote = t.priority !== undefined && t.priority > 5 ? ` 🔥优先级${t.priority}` : ''
    lines.push(`${i + 1}. ${t.description.slice(0, 80)}${verifyNote}${prioNote}${depNote}`)
  })

  if (hasCycle(subTasks)) {
    lines.push('', '⚠️ 检测到依赖环，已自动断开')
  }

  return lines.join('\n')
}

/** 重置内部 id 计数器（测试用） */
export function _resetPlannerSeq(): void {
  taskSeq = 0
}
