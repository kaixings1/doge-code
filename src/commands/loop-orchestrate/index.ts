/**
 * /loop-orchestrate — 真 subagent 链编排命令（阶段 1.5 + 2 + 3）
 *
 * 把 /orchestrate 的 prompt 驱动 agent 链，落到真实 subagent 调度引擎上。
 *
 * 每个角色由 runAgent 调度独立上下文的 subagent（而非角色化 AI 模拟），
 * 前一 subagent 的文本输出作为后一 subagent 的 HANDOFF 上下文，串行执行。
 *
 * local-jsx 命令：在 React 组件树里运行，context.canUseTool 可用，
 * 从而能真正调度 subagent（权限系统 + 工具池完整）。
 */

import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import { readFileSync, existsSync } from 'fs'
import { runAgentSync } from './agentExecutor.js'

// ============================================================================
// agentType 映射（内置英文 + 用户中文 agent）
// ============================================================================

const AGENT_ALIASES: Record<string, string> = {
  // 语义别名 → 实际 agentType
  planner: 'Plan',
  'tdd-guide': 'qa',
  'code-reviewer': 'code-reviewer',
  'security-reviewer': '安全审计员',
  architect: 'architect',
  coder: 'engineer',
  tester: 'qa',
  reviewer: 'code-reviewer',
}

function resolveAgentType(role: string): string {
  return AGENT_ALIASES[role] ?? role
}

// ============================================================================
// 工作流模板（映射角色链）
// ============================================================================

const WORKFLOWS: Record<string, string[]> = {
  feature: ['planner', 'tdd-guide', 'code-reviewer', 'security-reviewer'],
  bugfix: ['planner', 'tdd-guide', 'code-reviewer'],
  refactor: ['architect', 'code-reviewer', 'tdd-guide'],
  security: ['security-reviewer', 'code-reviewer', 'architect'],
}

function renderHelp(): string {
  const lines = [
    '## 🎯 /loop-orchestrate — 真 subagent 链编排',
    '',
    '用法：',
    '  /loop-orchestrate <workflow-type> <task-description>',
    '  /loop-orchestrate --graph <file.json>',
    '',
    '工作流类型（角色链）：',
    '  feature   功能开发：planner → tdd-guide → code-reviewer → security-reviewer',
    '  bugfix    缺陷修复：planner → tdd-guide → code-reviewer',
    '  refactor  重构：architect → code-reviewer → tdd-guide',
    '  security  安全评审：security-reviewer → code-reviewer → architect',
    '',
    '自定义 DAG 编排（--graph）：',
    '  读取 JSON 定义的角色依赖图，按拓扑序执行。',
    '  格式：',
    '  {',
    '    "nodes": [',
    '      { "id": "design", "role": "architect", "task": "设计架构" },',
    '      { "id": "impl", "role": "tdd-guide", "task": "实现功能", "dependencies": ["design"] }',
    '    ]',
    '  }',
    '',
    '示例：',
    '  /loop-orchestrate feature "Add user authentication"',
    '  /loop-orchestrate --graph ./orchestrate-graph.json',
    '',
    '说明：',
    '  每个角色调度一个独立上下文的 subagent，前一 subagent 的输出作为',
    '  后一 subagent 的 HANDOFF 上下文，串行执行直到链完成。',
  ]
  return lines.join('\n')
}

// ============================================================================
// 主命令（local-jsx）
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parts = (args ?? '').trim().split(/\s+/).filter(Boolean)
  const workflowType = parts[0] || ''

  // 帮助
  if (!workflowType || workflowType === 'help' || workflowType === '--help' || workflowType === '-h') {
    onDone(renderHelp())
    return null
  }

  // 自定义 DAG 编排
  if (workflowType === '--graph') {
    const graphPath = parts[1]
    if (!graphPath) {
      onDone('❌ --graph 需要指定图定义文件路径。\n\n' + renderHelp())
      return null
    }
    await runDag(graphPath, context, onDone)
    return null
  }

  const roles = WORKFLOWS[workflowType]
  if (!roles) {
    onDone(`❌ 未知工作流类型: ${workflowType}\n\n${renderHelp()}`)
    return null
  }

  const taskDescription = parts.slice(1).join(' ')
  if (!taskDescription) {
    onDone(`❌ 缺少任务描述。\n\n${renderHelp()}`)
    return null
  }

  // 角色链串行执行（真 subagent）
  const roleResults: Array<{ role: string; agentType: string; success: boolean; output: string }> = []
  let handoff = taskDescription

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i]!
    const agentType = resolveAgentType(role)

    // 前一 subagent 的输出作为 HANDOFF 上下文
    const prompt = i === 0
      ? taskDescription
      : `${taskDescription}\n\n## 前一角色（${roles[i - 1]}）的交接内容\n${handoff.slice(0, 2000)}`

    const result = await runAgentSync(agentType, prompt, context, context.canUseTool)

    roleResults.push({ role, agentType, success: result.success, output: result.output })
    handoff = result.output || handoff
  }

  const summaryLines = roleResults.map((r, i) => {
    const icon = r.success ? '✅' : '❌'
    return `${icon} ${i + 1}. ${r.role} (${r.agentType})：${r.output.slice(0, 120)}`
  })

  onDone(
    [
      '## 🎯 编排报告',
      '',
      `工作流：${workflowType}`,
      `任务：${taskDescription}`,
      `角色链：${roles.join(' → ')}`,
      '',
      '角色执行摘要：',
      ...summaryLines,
      '',
      `总体：${roleResults.every(r => r.success) ? '✅ 成功' : '⚠️ 部分角色失败'}`,
    ].join('\n'),
  )
  return null
}

// ============================================================================
// DAG 编排（阶段 3）：复用 planner.ts 的 topoSort / hasCycle
// ============================================================================

interface DagNode {
  id: string
  role: string
  task: string
  dependencies?: string[]
}

async function runDag(
  graphPath: string,
  context: Parameters<LocalJSXCommandCall>[1],
  onDone: LocalJSXCommandOnDone,
): Promise<void> {
  if (!existsSync(graphPath)) {
    onDone(`❌ 图定义文件不存在: ${graphPath}`)
    return
  }

  let parsed: { nodes?: DagNode[] }
  try {
    parsed = JSON.parse(readFileSync(graphPath, 'utf-8'))
  } catch (err) {
    onDone(`❌ 图定义解析失败: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  const nodes = parsed.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) {
    onDone('❌ 图定义缺少 nodes 数组。')
    return
  }

  const { topoSort, hasCycle } = await import('../loop/planner.js')
  const subTasks = nodes.map(n => ({
    id: n.id,
    description: n.task,
    status: 'pending' as const,
    dependencies: n.dependencies ?? [],
  }))

  if (hasCycle(subTasks)) {
    onDone('❌ 图定义存在依赖环，无法执行。请检查 dependencies 字段。')
    return
  }

  const order = topoSort(subTasks)
  if (!order) {
    onDone('❌ 拓扑排序失败（存在环或无效依赖）。')
    return
  }

  const roleById = new Map(nodes.map(n => [n.id, resolveAgentType(n.role)]))
  const results: Array<{ id: string; role: string; success: boolean; output: string }> = []
  const outputById = new Map<string, string>()

  for (const id of order) {
    const node = nodes.find(n => n.id === id)!
    const agentType = roleById.get(id) ?? 'general-purpose'

    const depOutputs = (node.dependencies ?? [])
      .map(depId => outputById.get(depId))
      .filter(Boolean)
      .map(o => o!.slice(0, 1000))
      .join('\n\n')

    const prompt = `${node.task}${depOutputs ? `\n\n## 依赖节点的输出\n${depOutputs}` : ''}`

    const result = await runAgentSync(agentType, prompt, context, context.canUseTool)
    results.push({ id, role: node.role, success: result.success, output: result.output })
    outputById.set(id, result.output || '')
  }

  const summaryLines = results.map((r, i) => {
    const icon = r.success ? '✅' : '❌'
    return `${icon} ${i + 1}. [${r.role}] ${r.id}：${r.output.slice(0, 120)}`
  })

  onDone(
    [
      '## 🎯 DAG 编排报告',
      '',
      `图定义：${graphPath}`,
      `节点数：${nodes.length}`,
      `拓扑序：${order.join(' → ')}`,
      '',
      '节点执行摘要：',
      ...summaryLines,
      '',
      `总体：${results.every(r => r.success) ? '✅ 成功' : '⚠️ 部分节点失败'}`,
    ].join('\n'),
  )
}

const loopOrchestrate = {
  type: 'local-jsx',
  name: 'loop-orchestrate',
  description: '真 subagent 链编排 — 按 feature/bugfix/refactor/security 模板串行调度独立 subagent',
  aliases: ['/loop-orchestrate', '/orchestrate-v2'],
  argumentHint: '<workflow-type> <task-description>',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default loopOrchestrate
