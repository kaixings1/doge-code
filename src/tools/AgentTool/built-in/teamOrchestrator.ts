/**
 * teamOrchestrator.ts — 多角色协作编排器（吸收 MetaGPT 精华）
 *
 * 工作流：需求分析(PM) → 方案设计(Architect) → 任务分派(TeamLeader) → 执行(Engineer) → 验证(QA)
 * 支持两种模式：
 *   - pipeline: 严格串行（每个阶段完成后才进入下一个）
 *   - parallel: 并行研究阶段（多个 Worker 同时调研）
 *
 * 结果合并策略：
 *   - consensus: 多数投票
 *   - merge: 结果拼接
 *   - best: 置信度最高
 */

import { TEAM_LEADER_AGENT } from './teamLeaderAgent.js'
import { PM_AGENT } from './pmAgent.js'
import { ENGINEER_AGENT } from './engineerAgent.js'
import type { AgentDefinition } from '../loadAgentsDir.js'

// ─── 角色注册表 ────────────────────────────────────────────

export interface RoleConfig {
  agentType: string
  description: string
  systemPrompt: string
  allowedTools: string[]
  maxTurns: number
  retryPolicy: 'none' | 'once' | 'twice'
  outputFormat: 'text' | 'structured' | 'json'
}

export const ROLE_REGISTRY: Record<string, RoleConfig> = {
  team_leader: {
    agentType: 'team-leader',
    description: '任务分解、角色协调、结果整合、质量把关',
    systemPrompt: TEAM_LEADER_AGENT.getSystemPrompt({ toolUseContext: { options: {} as any } }),
    allowedTools: ['bash', 'file_read', 'file_edit', 'file_write', 'git', 'glob', 'grep'],
    maxTurns: 20,
    retryPolicy: 'once',
    outputFormat: 'structured',
  },
  pm: {
    agentType: 'pm',
    description: '需求分析、PRD 编写、用户故事、验收标准',
    systemPrompt: PM_AGENT.getSystemPrompt({ toolUseContext: { options: {} as any } }),
    allowedTools: ['bash', 'file_read', 'file_write', 'glob'],
    maxTurns: 10,
    retryPolicy: 'none',
    outputFormat: 'text',
  },
  architect: {
    agentType: 'architect',
    description: '技术方案设计、架构决策、模块划分、接口定义',
    systemPrompt: `你是 Architect 角色。你的职责是：
1. 根据 PRD 设计技术方案
2. 定义模块边界和接口契约
3. 评估技术选型和风险
4. 输出架构决策记录（ADR）
5. 与 Engineer� 协作确保方案可落地

工作原则：
- 方案必须可执行、有明确的模块划分
- 每个接口定义参数类型和返回值
- 识别技术风险并给出缓解方案
- 输出格式：ADR 编号 + 标题 + 上下文 + 决策 + 后果`,
    allowedTools: ['bash', 'file_read', 'file_write', 'glob', 'grep'],
    maxTurns: 15,
    retryPolicy: 'once',
    outputFormat: 'structured',
  },
  engineer: {
    agentType: 'engineer',
    description: '功能实现、代码编写、单元测试、代码审查',
    systemPrompt: ENGINEER_AGENT.getSystemPrompt({ toolUseContext: { options: {} as any } }),
    allowedTools: ['bash', 'file_read', 'file_edit', 'file_write', 'git', 'glob', 'grep'],
    maxTurns: 30,
    retryPolicy: 'twice',
    outputFormat: 'text',
  },
  qa: {
    agentType: 'qa',
    description: '测试设计、集成测试、E2E 测试、质量门禁',
    systemPrompt: `你是 QA 角色。你的职责是：
1. 根据 PRD 和实现编写测试计划
2. 编写单元测试和集成测试
3. 运行测试并分析失败原因
4. 输出质量报告：通过率、覆盖率、阻塞项
5. 不通过的测试必须给出明确的修复建议

工作原则：
- 测试覆盖正常路径、边界条件和错误路径
- 失败必须附带错误日志和修复建┮�
- 覆盖率目标：核心模块 >= 80%
- 输出格式：测试摘要表 + 失败详情 + 修复建议`,
    allowedTools: ['bash', 'file_read', 'file_write', 'glob', 'grep'],
    maxTurns: 20,
    retryPolicy: 'once',
    outputFormat: 'structured',
  },
  researcher: {
    agentType: 'researcher',
    description: '代码库调研、技术调研、依赖分析、最佳实践研究',
    systemPrompt: `你是 Researcher 角色。你的职责是：
1. 调研代码库中相关的现有实现
2. 研究技术方案的最佳实践
3. 分析依赖关系和影响范围
4. 输出调研报告：发现、建议、风险
5. 只调研，不修改文件

工作原则：
- 调研报告必须包含具体的文件路径和行号
- 区分事实（已找到的代码）和推断（基于经验的建议）
- 列出所有可能受影响的文件和函数
- 识别潜在的风险和副作用`,
    allowedTools: ['bash', 'file_read', 'glob', 'grep', 'code_search'],
    maxTurns: 10,
    retryPolicy: 'none',
    outputFormat: 'structured',
  },
}

// ─── 工作流阶段 ────────────────────────────────────────────

export type WorkflowStage =
  | 'research'      // 调研：了解代码库现状
  | 'analyze'       // 分析：PM 输出 PRD
  | 'design'        // 设计：Architect 输出方案
  | 'plan'          // 规划：TeamLeader 输出任务计划
  | 'implement'     // 实现：Engineer 写代码
  | 'verify'        // 验证：QA 跑测试
  | 'review'        // 审查：TeamLeader 最终审核
  | 'done'          // 完成

export interface StageContext {
  stage: WorkflowStage
  task: string
  previousOutput?: string
  roleOutputs: Map<WorkflowStage, string>
  config: OrchestratorConfig
}

export interface OrchestratorConfig {
  mode: 'pipeline' | 'parallel'
  maxIterations: number
  parallelResearch: boolean
  mergeStrategy: 'consensus' | 'merge' | 'best'
  roles: string[]       // 启用的角色列表
  autoFix: boolean      // 自动修复失败
  qualityGate: boolean  // QA 质量门禁
  verbose: boolean
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  mode: 'pipeline',
  maxIterations: 10,
  parallelResearch: true,
  mergeStrategy: 'merge',
  roles: ['team_leader', 'pm', 'architect', 'engineer', 'qa', 'researcher'],
  autoFix: true,
  qualityGate: true,
  verbose: false,
}

// ─── 结果结构 ────────────────────────────────────────────

export interface RoleExecutionResult {
  role: string
  stage: WorkflowStage
  success: boolean
  output: string
  iterations: number
  duration: number
  error?: string
}

export interface OrchestrationResult {
  success: boolean
  finalStage: WorkflowStage
  roleResults: RoleExecutionResult[]
  mergedOutput: string
  qualityScore: number        // 0-100，QA 评估
  totalDuration: number
  totalIterations: number
  summary: string
  artifacts: string[]         // 生成的文件路径
}

// ─── 阶段转换 ────────────────────────────────────────────

const PIPELINE_STAGES: WorkflowStage[] = [
  'research', 'analyze', 'design', 'plan', 'implement', 'verify', 'review', 'done'
]

const PARALLEL_STAGES: WorkflowStage[] = [
  'research', 'analyze', 'implement', 'verify', 'done'
]

function getNextStage(current: WorkflowStage, mode: string): WorkflowStage | null {
  const stages = mode === 'parallel' ? PARALLEL_STAGES : PIPELINE_STAGES
  const idx = stages.indexOf(current)
  if (idx < 0 || idx >= stages.length - 1) return null
  return stages[idx + 1]
}

// ─── 阶段提示词构建 ───────────────────────�────────────────────

function buildStagePrompt(ctx: StageContext): string {
  const role = ROLE_REGISTRY[ctx.stage]
  if (!role) return ctx.task

  const previous = ctx.previousOutput ? `\n\n## 前序阶段输出\n${ctx.previousOutput}` : ''
  const roleOutputs = ctx.config.verbose && ctx.roleOutputs.size > 0
    ? '\n\n## 已完成的阶段输出\n' + Array.from(ctx.roleOutputs.entries())
        .map(([s, o]) => `### ${s}\n${o.slice(0, 500)}`)
        .join('\n\n')
    : ''

  const retryHint = ctx.config.autoFix
    ? '\n\n如果遇到错误，先尝试自行修复。如果无法修复，在输出末尾标记 [BLOCKED] 并说明原因。'
    : ''

  switch (ctx.stage) {
    case 'research':
      return `## 调研阶段\n\n任务：${ctx.task}\n\n请调研代码库中相关的现有实现、依赖关系和影响范围。只调研不修改文件。输出格式：\n1. 相关文件列表（路径 + 行号）\n2. 现有实现摘要\n3. 潜在风险和依赖${previous}${retryHint}`

    case 'analyze':
      return `## 需求分析阶段\n\n任务：${ctx.task}\n\n请基于调研结果编写 PRD（产品需求文档）：\n1. 功能概述\n2. 用户故事（As a... I want... So that...）\n3. 验收标准（Given/When/Then）\n4. 优先级（P0/P1/P2）\n5. 范围边界（什么不做）${previous}${roleOutputs}${retryHint}`

    case 'design':
      return `## 技术设计阶段\n\n任务：${ctx.task}\n\n请基于 PRD 设计技术方案：\n1. 模块划分和职责\n2. 接口定义（参数/返回值/异常）\n3. 数据流和状态管理\n4. 技术选型和理由\n5. 风险评估和缓解方案\n6. 与现有代码的集成点${previous}${roleOutputs}${retryHint}`

    case 'plan':
      return `## 任务规划阶段\n\n任务：${ctx.task}\n\n请将技术方案分解为可执行的任务：\n1. 任务列表（编号 + 描述 + 估计复杂度）\n2. 依赖关系（A 依赖 B）\n3. 执行顺序\n4. 每个任务的验收标准\n5. 风险和应对方案${previous}${roleOutputs}${retryHint}`

    case 'implement':
      return `## 实现阶段\n\n任务：${ctx.task}\n\n请根据任务计划编写代码：\n1. 按计划逐步实现\n2. 遵循项目代码规范\n3. 每个 commit 有清晰的 message\n4. 完成后运行相关测试\n5. 如果测试失败，自动修复${previous}${roleOutputs}${retryHint}`

    case 'verify':
      return `## 验证阶段\n\n任务：${ctx.task}\n\n请验证实现是否正确：\n1. 运行相关测试（单元测试 + 集成测试）\n2. 检查代码覆盖率\n3. 验证是否符合 PRD 的验收��准\n4. 输出质量报告：\n   - 测试通过率\n   - 覆盖率\n   - 阻塞项和修复建议${previous}${roleOutputs}${retryHint}`

    case 'review':
      return `## 最终审查阶段\n\n任务：${ctx.task}\n\n请对所有阶段输出进行最终审查：\n1. 检查所有阶段输出是否完整\n2. 验证实现是否满足需求\n3. 检查代码质量和规范\n4. 给出最终结论：通过 / 不通过（附带原因）\n5. 输出交付物清单${previous}${roleOutputs}${retryHint}`

    default:
      return ctx.task
  }
}

// ─── 结果合并 ────────────────────────────────────────────

function mergeResults(results: RoleExecutionResult[], strategy: string): string {
  if (results.length === 0) return ''

  switch (strategy) {
    case 'consensus': {
      // 多数投票：取出现次数最多的结论
      const outputs = results.map(r => r.output)
      const counts = new Map<string, number>()
      for (const o of outputs) {
        const key = o.slice(0, 200)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      let best = ''
      let maxCount = 0
      for (const [key, count] of counts) {
        if (count > maxCount) {
          maxCount = count
          best = key
        }
      }
      return `[共识结果 ${maxCount}/${results.length}]\n${best}`
    }

    case 'best': {
      // 置信度最高
      const best = results
        .filter(r => r.success)
        .sort((a, b) => (b.output.length - a.output.length))[0]
      return best ? best.output : results[0]?.output ?? ''
    }

    case 'merge':
    default: {
      // 拼接所有结果
      return results
        .filter(r => r.success)
        .map(r => `## ${r.role} (${r.stage})\n${r.output}`)
        .join('\n\n---\n\n')
    }
  }
}

// ─── 质量评分 ────────────────────────────────────────────

function computeQualityScore(results: RoleExecutionResult[]): number {
  if (results.length === 0) return 0

  let score = 0
  const weights: Record<string, number> = {
    research: 10,
    analyze: 15,
    design: 15,
    plan: 10,
    implement: 25,
    verify: 20,
    review: 5,
  }

  for (const r of results) {
    const w = weights[r.stage] ?? 10
    if (r.success) {
      score += w
      // 输出长度加成（0-5）
      score += Math.min(5, Math.floor(r.output.length / 200))
    } else {
      score += Math.floor(w * 0.2) // 失败也给少量分
    }
  }

  return Math.min(100, score)
}

// ─── 公开 API ────────────────────────────────────────────

export {
  getNextStage,
  buildStagePrompt,
  mergeResults,
  computeQualityScore
}
