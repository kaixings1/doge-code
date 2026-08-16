/**
 * src/engine/orchestrator/taskGraph.ts
 *
 * 任务依赖图 — 吸收 CrewAI Task context 依赖 + LangGraph 拓扑
 *
 * 支持三种拓扑：
 *   - pipeline: A → B → C → D（严格顺序）
 *   - parallel: A → [B, C, D] → E（扇出扇入）
 *   - discuss: 角色间自由对话（无固定边）
 */

import type { WorkflowStage, AgentRole } from './messages.js'

// ---------------------------------------------------------------------------
// TaskNode — 图中的一个任务节点
// ---------------------------------------------------------------------------

export interface TaskNode {
  id: string
  description: string
  stage: WorkflowStage
  role: AgentRole
  dependencies: string[]
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

// ---------------------------------------------------------------------------
// TaskGraph — 依赖图管理
// ---------------------------------------------------------------------------

export class TaskGraph {
  private nodes: Map<string, TaskNode> = new Map()

  // 添加节点
  addNode(node: TaskNode): void {
    this.nodes.set(node.id, node)
  }

  // 批量添加
  addNodes(nodes: TaskNode[]): void {
    for (const n of nodes) this.nodes.set(n.id, n)
  }

  // 获取节点
  get(id: string): TaskNode | undefined {
    return this.nodes.get(id)
  }

  // 获取所有节点
  getAll(): TaskNode[] {
    return Array.from(this.nodes.values())
  }

  // 获取就绪节点（所有依赖已完成）
  getReady(): TaskNode[] {
    return this.getAll().filter(n => {
      if (n.status !== 'pending') return false
      return n.dependencies.every(depId => {
        const dep = this.nodes.get(depId)
        return dep?.status === 'completed'
      })
    })
  }

  // 获取失败节点
  getFailed(): TaskNode[] {
    return this.getAll().filter(n => n.status === 'failed')
  }

  // 标记完成
  markCompleted(id: string, result: string): void {
    const node = this.nodes.get(id)
    if (node) {
      node.status = 'completed'
      node.result = result
      node.completedAt = new Date().toISOString()
    }
  }

  // 标记失败
  markFailed(id: string, error: string): void {
    const node = this.nodes.get(id)
    if (node) {
      node.status = 'failed'
      node.error = error
      node.completedAt = new Date().toISOString()
    }
  }

  // 标记运行中
  markRunning(id: string): void {
    const node = this.nodes.get(id)
    if (node) {
      node.status = 'running'
      node.startedAt = new Date().toISOString()
    }
  }

  // 跳过（依赖失败时）
  skipIfDependencyFailed(id: string): boolean {
    const node = this.nodes.get(id)
    if (!node) return false

    const hasFailedDep = node.dependencies.some(depId => {
      const dep = this.nodes.get(depId)
      return dep?.status === 'failed'
    })

    if (hasFailedDep) {
      node.status = 'skipped'
      node.error = 'dependency failed'
      return true
    }
    return false
  }

  // 是否全部完成
  isAllCompleted(): boolean {
    return this.getAll().every(n => n.status === 'completed' || n.status === 'skipped')
  }

  // 是否有失败
  hasFailed(): boolean {
    return this.getAll().some(n => n.status === 'failed')
  }

  // 统计
  stats(): { total: number; pending: number; running: number; completed: number; failed: number; skipped: number } {
    const all = this.getAll()
    return {
      total: all.length,
      pending: all.filter(n => n.status === 'pending').length,
      running: all.filter(n => n.status === 'running').length,
      completed: all.filter(n => n.status === 'completed').length,
      failed: all.filter(n => n.status === 'failed').length,
      skipped: all.filter(n => n.status === 'skipped').length,
    }
  }
}

// ---------------------------------------------------------------------------
// buildPipelineGraph — 构建严格顺序流水线图
// ---------------------------------------------------------------------------

export function buildPipelineGraph(stages: WorkflowStage[], taskDescription: string): TaskNode[] {
  const nodes: TaskNode[] = []
  let prevId: string | undefined

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    const id = `step-${i}-${stage}`
    nodes.push({
      id,
      description: getStageDescription(stage, taskDescription, i),
      stage,
      role: stageToRole(stage),
      dependencies: prevId ? [prevId] : [],
      status: 'pending',
    })
    prevId = id
  }

  return nodes
}

// ---------------------------------------------------------------------------
// buildParallelGraph — 构建并行图（调研阶段扇出）
// ---------------------------------------------------------------------------

export function buildParallelGraph(taskDescription: string): TaskNode[] {
  const nodes: TaskNode[] = []

  // 阶段 0: 调研（并行扇出）
  const researchStages: WorkflowStage[] = ['research']
  for (const stage of researchStages) {
    nodes.push({
      id: `step-0-${stage}`,
      description: getStageDescription(stage, taskDescription, 0),
      stage,
      role: stageToRole(stage),
      dependencies: [],
      status: 'pending',
    })
  }

  // 后续阶段串行
  const remainingStages: WorkflowStage[] = ['analyze', 'plan', 'implement', 'verify', 'review']
  let prevId = `step-0-research`

  for (let i = 0; i < remainingStages.length; i++) {
    const stage = remainingStages[i]
    const id = `step-${i + 1}-${stage}`
    nodes.push({
      id,
      description: getStageDescription(stage, taskDescription, i + 1),
      stage,
      role: stageToRole(stage),
      dependencies: [prevId],
      status: 'pending',
    })
    prevId = id
  }

  return nodes
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function stageToRole(stage: WorkflowStage): AgentRole {
  const map: Record<WorkflowStage, AgentRole> = {
    research: 'researcher',
    analyze: 'pm',
    design: 'architect',
    plan: 'team_leader',
    implement: 'engineer',
    verify: 'qa',
    review: 'team_leader',
    done: 'supervisor',
    failed: 'supervisor',
  }
  return map[stage] ?? 'team_leader'
}

function getStageDescription(stage: WorkflowStage, task: string, index: number): string {
  const templates: Record<WorkflowStage, string> = {
    research: `[调研] 调研代码库中与"${task}"相关的现有实现、依赖关系和影响范围。`,
    analyze: `[需求分析] 基于调研结果，为"${task}"编写 PRD（产品需求文档）。`,
    design: `[技术设计] 基于 PRD，为"${task}"设计技术方案和架构。`,
    plan: `[任务规划] 将技术方案分解为可执行的任务计划。`,
    implement: `[实现] 根据任务计划，为"${task}"编写代码。`,
    verify: `[验证] 运行测试，验证实现是否正确。`,
    review: `[审查] 对所有阶段输出进行最终审查。`,
    done: '[完成] 所有阶段已完成。',
    failed: '[失败] 任务执行失败。',
  }
  return templates[stage] ?? task
}
