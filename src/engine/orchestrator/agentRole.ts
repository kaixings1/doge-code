/**
 * src/engine/orchestrator/agentRole.ts
 *
 * Agent 角色定义 — 对齐 CrewAI role/goal/backstory 三元组
 * 复用项目已有的 built-in agent system prompts
 */

import type { AgentRole, AgentDefinition } from './messages.js'

// ---------------------------------------------------------------------------
// 角色元数据（对齐 teamOrchestrator.ts ROLE_REGISTRY + built-in agents）
// ---------------------------------------------------------------------------

const ROLE_META: Record<
  AgentRole,
  { name: string; goal: string; backstory: string; allowedTools: string[]; maxTurns: number }
> = {
  team_leader: {
    name: 'TeamLeader',
    goal: '任务分解、角色协调、结果整合、质量把关',
    backstory: '你是 TeamLeader，负责复杂任务分解、角色协调和最终交付。当任务涉及多步骤、多角色协作时，你负责确保每个角色各司其职，最终交付物完整可运行。',
    allowedTools: ['bash', 'file_read', 'file_edit', 'file_write', 'git', 'glob', 'grep'],
    maxTurns: 20,
  },
  pm: {
    name: 'ProductManager',
    goal: '需求分析、PRD 编写、用户故事、验收标准',
    backstory: '你是 ProductManager，负责将模糊需求转化为清晰的 PRD。你需要定义功能边界和优先级，设计交互流程和用户体验，编写产品文档和用户故事，并与技术角色协作确保可行性。',
    allowedTools: ['bash', 'file_read', 'file_write', 'glob'],
    maxTurns: 10,
  },
  architect: {
    name: 'Architect',
    goal: '技术方案设计、架构决策、模块划分、接口定义',
    backstory: '你是 Architect，负责根据 PRD 设计技术方案。你需要定义模块边界和接口契约，评估技术选型和风险，输出架构决策记录（ADR），并与 Engineer 协作确保方案可落地。',
    allowedTools: ['bash', 'file_read', 'file_write', 'glob', 'grep'],
    maxTurns: 15,
  },
  engineer: {
    name: 'Engineer',
    goal: '功能实现、代码编写、单元测试、代码审查',
    backstory: '你是 Engineer，负责根据 PRD 和技术方案实现功能。你需要编写高质量、可维护的代码，遵循代码规范和最佳实践，编写单元测试和集成测试，进行代码审查和重构。',
    allowedTools: ['bash', 'file_read', 'file_edit', 'file_write', 'git', 'glob', 'grep'],
    maxTurns: 30,
  },
  qa: {
    name: 'QA',
    goal: '测试设计、集成测试、E2E 测试、质量门禁',
    backstory: '你是 QA，负责根据 PRD 和实现编写测试计划。你需要编写单元测试和集成测试，运行测试并分析失败原因，输出质量报告：通过率、覆盖率、阻塞项。不通过的测试必须给出明确的修复建议。',
    allowedTools: ['bash', 'file_read', 'file_write', 'glob', 'grep'],
    maxTurns: 20,
  },
  researcher: {
    name: 'Researcher',
    goal: '代码库调研、技术调研、依赖分析、最佳实践研究',
    backstory: '你是 Researcher，负责调研代码库中相关的现有实现、研究技术方案的最佳实践、分析依赖关系和影响范围。你只调研不修改文件，调研报告必须包含具体的文件路径和行号，区分事实（已找到的代码）和推断（基于经验的建议）。',
    allowedTools: ['bash', 'file_read', 'glob', 'grep', 'code_search'],
    maxTurns: 10,
  },
  supervisor: {
    name: 'Supervisor',
    goal: '协调多个角色、决定下一步执行哪个角色、合并结果',
    backstory: '你是 Supervisor，是整个编排系统的决策中枢。你接收用户的自然语言输入，协调多个角色完成复杂任务。你需要根据当前状态决定下一步执行哪个角色，合并各角色的输出，并判断任务是否完成。',
    allowedTools: [],
    maxTurns: 50,
  },
}

// ---------------------------------------------------------------------------
// buildAgentDefinition — 从角色标识构建完整定义
// ---------------------------------------------------------------------------

export function buildAgentDefinition(role: AgentRole): AgentDefinition {
  const meta = ROLE_META[role]
  if (!meta) throw new Error(`Unknown agent role: ${role}`)

  const systemPrompt = buildSystemPrompt(role, meta)

  return {
    role,
    name: meta.name,
    goal: meta.goal,
    backstory: meta.backstory,
    systemPrompt,
    allowedTools: meta.allowedTools,
    maxTurns: meta.maxTurns,
    retryPolicy: role === 'engineer' ? 'twice' : role === 'qa' || role === 'architect' ? 'once' : 'none',
    outputFormat: role === 'pm' || role === 'engineer' ? 'text' : 'structured',
  }
}

// ---------------------------------------------------------------------------
// buildSystemPrompt — 组合 goal + backstory + 可用工具 + 执行规则
// ---------------------------------------------------------------------------

function buildSystemPrompt(role: AgentRole, meta: typeof ROLE_META[AgentRole]): string {
  const toolsList = meta.allowedTools.length > 0
    ? `\n## 可用工具\n${meta.allowedTools.map(t => `- ${t}`).join('\n')}`
    : '\n## 可用工具\n（无，仅做决策和协调）'

  return `${meta.backstory}

## 你的目标
${meta.goal}

## 执行规则
1. 专注于你的角色职责，不要越界
2. 输出必须结构化、可验证
3. 如果遇到无法解决的问题，标记 [BLOCKED] 并说明原因
4. 引用具体文件时使用完整路径和行号${toolsList}

## 输出格式
根据你的角色，输出对应的结构化内容（PRD、ADR、任务计划、代码、测试报告等）。`
}

// ---------------------------------------------------------------------------
// getAllRoles — 获取所有可用角色
// ---------------------------------------------------------------------------

export function getAllRoles(): AgentRole[] {
  return Object.keys(ROLE_META) as AgentRole[]
}

// ---------------------------------------------------------------------------
// getRoleDisplayName — 角色显示名称
// ---------------------------------------------------------------------------

export function getRoleDisplayName(role: AgentRole): string {
  return ROLE_META[role]?.name ?? role
}
