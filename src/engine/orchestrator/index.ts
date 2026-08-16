/**
 * src/engine/orchestrator/index.ts
 *
 * 编排器统一导出
 */

export { Orchestrator, type OrchestratorDeps, DEFAULT_CONFIG } from './orchestrator.js'
export { PipelineExecutor, type PipelineExecutorDeps, PIPELINE_STAGES } from './pipeline.js'
export { TaskGraph, buildPipelineGraph, buildParallelGraph } from './taskGraph.js'
export {
  buildAgentDefinition,
  getAllRoles,
  getRoleDisplayName,
} from './agentRole.js'
export type {
  AgentRole,
  AgentMessage,
  WorkflowStage,
  StepResult,
  RoleExecutionResult,
  OrchestrationResult,
  OrchestratorConfig,
  AgentDefinition,
  TaskNode,
  StageContext,
} from './messages.js'
