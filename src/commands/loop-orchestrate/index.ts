/**
 * /loop-orchestrate — 角色化 Agent 链编排命令（阶段 2）
 *
 * 把 /orchestrate 的 prompt 驱动 agent 链，落到真实执行引擎上。
 *
 * 角色链按 workflow 模板串行执行，每个角色用 createAITaskExecutor
 * 注入角色 systemPrompt（角色化 AI），前一角色的输出作为后一角色的
 * HANDOFF 上下文。复用 loop 引擎的真实 AI 执行 + 错误恢复能力。
 *
 * 设计说明：runAgent（完整 subagent 进程调度）因循环依赖 + 复杂度暂缓，
 * 本命令用「角色化 AI」替代——同一执行器注入不同角色身份，等价于
 * 轻量多 agent 协作。详见 docs/ORCHESTRATION_PLAN.md 阶段 1.5。
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js'
import { readFileSync, existsSync } from 'fs'

// ============================================================================
// 角色定义（精简角色身份，等价于 subagent 的角色分工）
// ============================================================================

const ROLES: Record<string, string> = {
  planner: '你是一名资深技术规划师。你的职责是分析需求、拆解为可执行子任务、识别依赖关系、制定实现计划。请先输出清晰的任务分解和实现步骤。',
  'tdd-guide': '你是一名 TDD（测试驱动开发）教练。你的职责是：先编写测试用例，再实现代码以通过测试。请遵循红-绿-重构循环，确保每个功能都有测试覆盖。',
  'code-reviewer': '你是一名首席代码审查员。你的职责是评估代码的正确性、可读性、性能和安全，并提供可操作、分类的反馈。请逐项检查：正确性、边界情况、错误处理、代码风格。',
  'security-reviewer': '你是一名安全审计专家。你的职责是检测安全漏洞：注入、XSS、SSRF、敏感数据泄露、不安全的加密等 OWASP Top 10 问题。请给出漏洞清单和修复建议。',
  architect: '你是一名系统架构师。你的职责是进行系统设计和技术决策，评估方案的扩展性、可维护性和权衡。请先输出整体架构设计，再落地实现。',
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

function text(value: string): LocalCommandResult {
  return { type: 'text', value }
}

function renderHelp(): string {
  const lines = [
    '## 🎯 /loop-orchestrate — 角色化 Agent 链编排',
    '',
    '用法：',
    '  /loop-orchestrate <workflow-type> <task-description>',
    '  /loop-orchestrate --graph <file.json>',
    '',
    '工作流类型：',
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
    '  每个角色由真实 AI 驱动（角色化提示），前一角色的输出作为',
    '  后一角色的 HANDOFF 上下文，按依赖顺序执行直到完成。',
  ]
  return lines.join('\n')
}

// ============================================================================
// 主命令
// ============================================================================

const call: LocalCommandCall = async (args, context): Promise<LocalCommandResult> => {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const workflowType = parts[0] || ''

  // 帮助
  if (!workflowType || workflowType === 'help' || workflowType === '--help' || workflowType === '-h') {
    return text(renderHelp())
  }

  // 自定义 DAG 编排（阶段 3）
  if (workflowType === '--graph') {
    const graphPath = parts[1]
    if (!graphPath) {
      return text('❌ --graph 需要指定图定义文件路径。\n\n' + renderHelp())
    }
    return runDag(graphPath, context)
  }

  const roles = WORKFLOWS[workflowType]
  if (!roles) {
    return text(`❌ 未知工作流类型: ${workflowType}\n\n${renderHelp()}`)
  }

  const taskDescription = parts.slice(1).join(' ')
  if (!taskDescription) {
    return text(`❌ 缺少任务描述。\n\n${renderHelp()}`)
  }

  // 角色链串行执行
  const { createAITaskExecutor } = await import('../loop/ai-task-executor.js')
  const ctx = (context ?? { options: { mainLoopModel: '' } }) as LocalJSXCommandContext
  const executor = createAITaskExecutor(ctx as never, {
    maxRetries: 2,
    taskTimeout: 120000,
  })

  const roleResults: Array<{ role: string; success: boolean; output: string }> = []
  let handoff = taskDescription

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i]!
    const rolePrompt = ROLES[role] ?? '你是一名专业的软件工程师。'

    // 前一角色的输出作为 HANDOFF 上下文
    const handoffBlock = i === 0
      ? ''
      : `\n\n## 前一角色（${roles[i - 1]}）的交接内容\n${handoff.slice(0, 2000)}`

    const result = await executor(
      `## 总任务\n${taskDescription}${handoffBlock}\n\n## 你当前的角色职责\n${rolePrompt}`,
      rolePrompt,
      { id: `orch-${role}-${Date.now()}-${i}`, description: `${role}: ${taskDescription.slice(0, 80)}` },
    )

    roleResults.push({ role, success: result.success, output: result.output })
    handoff = result.output || handoff
  }

  // 汇总报告
  const summaryLines = roleResults.map((r, i) => {
    const icon = r.success ? '✅' : '❌'
    return `${icon} ${i + 1}. ${r.role}：${r.output.slice(0, 120)}`
  })

  return text(
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

async function runDag(graphPath: string, context: LocalJSXCommandContext | null): Promise<LocalCommandResult> {
  if (!existsSync(graphPath)) {
    return text(`❌ 图定义文件不存在: ${graphPath}`)
  }

  let parsed: { nodes?: DagNode[] }
  try {
    parsed = JSON.parse(readFileSync(graphPath, 'utf-8'))
  } catch (err) {
    return text(`❌ 图定义解析失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  const nodes = parsed.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return text('❌ 图定义缺少 nodes 数组。')
  }

  // 映射为 SubTask[]（复用 planner.ts 的拓扑排序/环检测）
  const { topoSort, hasCycle } = await import('../loop/planner.js')
  const subTasks = nodes.map(n => ({
    id: n.id,
    description: n.task,
    status: 'pending' as const,
    dependencies: n.dependencies ?? [],
  }))

  if (hasCycle(subTasks)) {
    return text('❌ 图定义存在依赖环，无法执行。请检查 dependencies 字段。')
  }

  const order = topoSort(subTasks)
  if (!order) {
    return text('❌ 拓扑排序失败（存在环或无效依赖）。')
  }

  // role 映射：id → role
  const roleById = new Map(nodes.map(n => [n.id, n.role]))

  const { createAITaskExecutor } = await import('../loop/ai-task-executor.js')
  const ctx = (context ?? { options: { mainLoopModel: '' } }) as LocalJSXCommandContext
  const executor = createAITaskExecutor(ctx as never, { maxRetries: 2, taskTimeout: 120000 })

  const results: Array<{ id: string; role: string; success: boolean; output: string }> = []
  const outputById = new Map<string, string>()

  for (const id of order) {
    const node = nodes.find(n => n.id === id)!
    const role = roleById.get(id) ?? 'planner'
    const rolePrompt = ROLES[role] ?? '你是一名专业的软件工程师。'

    // 依赖节点的输出作为上下文
    const depOutputs = (node.dependencies ?? [])
      .map(depId => outputById.get(depId))
      .filter(Boolean)
      .map(o => o!.slice(0, 1000))
      .join('\n\n')

    const result = await executor(
      `## 总任务\n${node.task}${depOutputs ? `\n\n## 依赖节点的输出\n${depOutputs}` : ''}\n\n## 你当前的角色职责\n${rolePrompt}`,
      rolePrompt,
      { id: `dag-${id}-${Date.now()}`, description: `${role}: ${node.task.slice(0, 80)}` },
    )

    results.push({ id, role, success: result.success, output: result.output })
    outputById.set(id, result.output || '')
  }

  const summaryLines = results.map((r, i) => {
    const icon = r.success ? '✅' : '❌'
    return `${icon} ${i + 1}. [${r.role}] ${r.id}：${r.output.slice(0, 120)}`
  })

  return text(
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
  type: 'local',
  name: 'loop-orchestrate',
  description: '角色化 Agent 链编排 — 按 feature/bugfix/refactor/security 模板串行调度角色化 AI',
  aliases: ['/loop-orchestrate', '/orchestrate-v2'],
  argumentHint: '<workflow-type> <task-description>',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default loopOrchestrate
