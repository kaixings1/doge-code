/**
 * src/engine/orchestrator/messages.ts
 *
 * 编排器内部消息协议 — 吸收自 MetaGPT Message + CrewAI Task context
 */

// ---------------------------------------------------------------------------
// Agent 角色标识
// ---------------------------------------------------------------------------

export type AgentRole =
  | 'team_leader'
  | 'pm'
  | 'architect'
  | 'engineer'
  | 'qa'
  | 'researcher'
  | 'supervisor'

// ---------------------------------------------------------------------------
// AgentMessage — 角色间通信的消息格式（对齐 MetaGPT Message）
// ---------------------------------------------------------------------------

export interface AgentMessage {
  /** 消息唯一 ID */
  id: string
  /** 发送者角色 */
  from: AgentRole
  /** 接收者角色（undefined = 广播） */
  to?: AgentRole
  /** 消息内容 */
  content: string
  /** 触发此消息的阶段/动作类型 */
  causeBy: WorkflowStage
  /** 关联的任务 ID */
  taskId?: string
  /** 时间戳 */
  timestamp: string
  /** 元数据（附件、引用等） */
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 工作流阶段（对齐 teamOrchestrator.ts）
// ---------------------------------------------------------------------------

export type WorkflowStage =
  | 'research'      // 调研
  | 'analyze'       // 需求分析（PM → PRD）
  | 'design'        // 技术设计（Architect → ADR）
  | 'plan'          // 任务规划（TeamLeader → 任务分解）
  | 'implement'     // 实现（Engineer → 代码）
  | 'verify'        // 验证（QA → 测试报告）
  | 'review'        // 审查（TeamLeader → 最终审核）
  | 'done'          // 完成
  | 'failed'        // 失败

// ---------------------------------------------------------------------------
// StepResult — TaskEngine 每步执行结果
// ---------------------------------------------------------------------------

export interface StepResult {
  signal: 'continue' | 'complete' | 'failed' | 'paused'
  action: string
  result: string
  filesModified?: string[]
}

// ---------------------------------------------------------------------------
// RoleExecutionResult — 单角色执行结果
// ---------------------------------------------------------------------------

export interface RoleExecutionResult {
  role: AgentRole
  stage: WorkflowStage
  success: boolean
  output: string
  iterations: number
  duration: number
  error?: string
  artifacts?: string[]     // 生成的文件路径
}

// ---------------------------------------------------------------------------
// OrchestrationResult — 完整编排结果
// ---------------------------------------------------------------------------

export interface OrchestrationResult {
  success: boolean
  finalStage: WorkflowStage
  roleResults: RoleExecutionResult[]
  mergedOutput: string
  qualityScore: number        // 0-100
  totalDuration: number
  totalIterations: number
  summary: string
  artifacts: string[]
  taskId?: string
}

// ---------------------------------------------------------------------------
// OrchestratorConfig — 编排器配置
// ---------------------------------------------------------------------------

export interface OrchestratorConfig {
  mode: 'pipeline' | 'parallel' | 'discuss'
  maxIterations: number
  parallelResearch: boolean
  mergeStrategy: 'consensus' | 'merge' | 'best'
  roles: AgentRole[]
  autoFix: boolean
  qualityGate: boolean
  verbose: boolean
  maxDiscussionRounds: number   // discuss 模式最大讨论轮数
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  mode: 'pipeline',
  maxIterations: 10,
  parallelResearch: true,
  mergeStrategy: 'merge',
  roles: ['team_leader', 'pm', 'architect', 'engineer', 'qa', 'researcher'],
  autoFix: true,
  qualityGate: true,
  verbose: false,
  maxDiscussionRounds: 5,
}

// ---------------------------------------------------------------------------
// AgentDefinition — 角色定义（对齐 CrewAI Agent 三元组）
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  role: AgentRole
  name: string
  goal: string
  backstory: string
  systemPrompt: string
  allowedTools: string[]
  maxTurns: number
  retryPolicy: 'none' | 'once' | 'twice'
  outputFormat: 'text' | 'structured' | 'json'
}

// ---------------------------------------------------------------------------
// TaskNode — 任务图中的节点
// ---------------------------------------------------------------------------

export interface TaskNode {
  id: string
  description: string
  stage: WorkflowStage
  role: AgentRole
  dependencies: string[]      // 依赖的节点 ID
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: RoleExecutionResult
}

// ---------------------------------------------------------------------------
// StageContext — 阶段执行上下文
// ---------------------------------------------------------------------------

export interface StageContext {
  stage: WorkflowStage
  task: string
  previousOutput?: string
  roleOutputs: Map<WorkflowStage, string>
  config: OrchestratorConfig
  messages: AgentMessage[]
}
