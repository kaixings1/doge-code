import type { ProgressMessage } from './message.js'
import type { HookProgress } from './hooks.js'
export type { HookProgress } from './hooks.js'

export type AgentToolProgress = {
  type: 'agent'
  name: string
  status: 'starting' | 'running' | 'completed' | 'error'
  description?: string
  tokensUsed?: number
}

export type BashProgress = {
  type: 'bash'
  output: string
  isRunning: boolean
  exitCode?: number
}

export type MCPProgress = {
  type: 'mcp'
  serverName: string
  toolName: string
  description?: string
  isRunning: boolean
}

export type REPLToolProgress = {
  type: 'repl'
  output: string
  isRunning: boolean
}

export type SkillToolProgress = {
  type: 'skill'
  skillName: string
  description?: string
  isRunning: boolean
}

export type TaskOutputProgress = {
  type: 'task_output'
  taskId: string
  output: string
  isRunning: boolean
}

export type WebSearchProgress = {
  type: 'web_search'
  query: string
  description?: string
  resultsCount?: number
  isSearching: boolean
}

export type CompactProgressEvent =
  | {
      type: 'hooks_start'
      hookType: 'pre_compact' | 'post_compact' | 'session_start'
    }
  | { type: 'compact_start' }
  | { type: 'compact_end' }

export type ToolProgressData =
  | AgentToolProgress
  | BashProgress
  | MCPProgress
  | REPLToolProgress
  | SkillToolProgress
  | TaskOutputProgress
  | WebSearchProgress

export type Progress = ToolProgressData | HookProgress

export type ToolProgress<P extends ToolProgressData> = {
  toolUseID: string
  data: P
}

export function filterToolProgressMessages(
  progressMessagesForMessage: ProgressMessage[],
): ProgressMessage<ToolProgressData>[] {
  return progressMessagesForMessage.filter(
    (msg): msg is ProgressMessage<ToolProgressData> =>
      typeof msg.data === 'object' && msg.data !== null && (msg.data as Record<string, unknown>).type !== 'hook_progress',
  )
}
