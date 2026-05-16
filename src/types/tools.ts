/** 工具进度数据 */
export type ToolProgressData = {
  kind?: string
  [key: string]: unknown
}

/** Shell 进度 */
export type ShellProgress = ToolProgressData
/** Bash 进度 */
export type BashProgress = ToolProgressData
/** PowerShell 进度 */
export type PowerShellProgress = ToolProgressData
/** MCP 进度 */
export type MCPProgress = ToolProgressData
/** 技能工具进度 */
export type SkillToolProgress = ToolProgressData
/** 任务输出进度 */
export type TaskOutputProgress = ToolProgressData
/** Web 搜索进度 */
export type WebSearchProgress = ToolProgressData
/** 代理工具进度 */
export type AgentToolProgress = ToolProgressData
/** REPL 工具进度 */
export type REPLToolProgress = ToolProgressData
/** SDK 工作流进度 */
export type SdkWorkflowProgress = ToolProgressData
