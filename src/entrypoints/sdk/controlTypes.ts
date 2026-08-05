import type { InternalPermissionMode } from 'src/types/permissions.js'

export type SDKControlInitializeRequest = {
  subtype: 'initialize'
  sdkMcpServers?: string[]
  promptSuggestions?: unknown[]
  systemPrompt?: string
  appendSystemPrompt?: string
  jsonSchema?: Record<string, unknown>
  [key: string]: unknown
}

export type SDKControlCancelRequest = {
  subtype: 'cancel'
  [key: string]: unknown
}

export type SDKControlPermissionRequest = {
  subtype: 'permission'
  [key: string]: unknown
}

export type SDKControlRequestInner =
  | SDKControlInitializeRequest
  | SDKControlCancelRequest
  | SDKControlPermissionRequest
  | { subtype: 'interrupt'; [key: string]: unknown }
  | {
      subtype: 'set_permission_mode'
      mode: InternalPermissionMode
      ultraplan?: boolean
      [key: string]: unknown
    }
  | { subtype: 'set_model'; model?: string; [key: string]: unknown }
  | {
      subtype: 'set_max_thinking_tokens'
      max_thinking_tokens?: number | null
      [key: string]: unknown
    }
  | {
      subtype: string
      reason?: string
      sdkMcpServers?: string[]
      promptSuggestions?: unknown[]
      agentProgressSummaries?: unknown[]
      mode?: InternalPermissionMode
      ultraplan?: boolean
      model?: string
      max_thinking_tokens?: number | null
      user_message_id?: string
      dry_run?: boolean
      message_uuid?: string
      path?: string
      mtime?: number
      task_id?: string
      description?: string
      persist?: boolean
      question?: string
      servers?: unknown[]
      serverName?: string
      callbackUrl?: string
      authorizationCode?: string
      state?: string
      settings?: Record<string, unknown>
      loginWithClaudeAi?: boolean
      [key: string]: unknown
    }

export type SDKControlRequest = {
  type: 'control_request'
  request_id: string
  request: SDKControlRequestInner
}

export type SDKControlInitializeResponse = {
  ok?: boolean
  [key: string]: unknown
}

export type SDKControlMcpSetServersResponse = {
  ok?: boolean
  [key: string]: unknown
}

export type SDKControlReloadPluginsResponse = {
  ok?: boolean
  [key: string]: unknown
}

export type SDKControlResponse = {
  type: 'control_response'
  request_id?: string
  response: Record<string, unknown>
}

export type SDKPartialAssistantMessage = {
  type: 'assistant'
  [key: string]: unknown
}

export type StdinMessage = {
  type: string
  subtype?: string
  request?: SDKControlRequestInner
  request_id?: string
  response?: Record<string, unknown>
  sdkMcpServers?: unknown[]
  reason?: string
  promptSuggestions?: unknown[]
  agentProgressSummaries?: unknown[]
  serverName?: string
  path?: string
  mtime?: number
  max_thinking_tokens?: number
  user_message_id?: string
  dry_run?: boolean
  message_uuid?: string
  message?: unknown
  enabled?: boolean
  callbackUrl?: string
  servers?: unknown[]
  [key: string]: unknown
}

export type StdoutMessage = {
  type: string
  subtype?: string
  data?: unknown
  timestamp?: string
  id?: string
  [key: string]: unknown
}
