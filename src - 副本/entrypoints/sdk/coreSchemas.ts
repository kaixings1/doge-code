/**
 * SDK Core Schemas - Zod schemas for serializable SDK data types.
 *
 * These schemas are the single source of truth for SDK data types.
 * TypeScript types are generated from these schemas and committed for IDE support.
 *
 * @see scripts/generate-sdk-types.ts for type generation
 */

import { z } from 'zod/v4'
import { lazySchema } from '../../utils/lazySchema.js'

// ============================================================================
// Usage & Model Types
// ============================================================================

export const ModelUsageSchema = lazySchema(() =>
  z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    webSearchRequests: z.number(),
    costUSD: z.number(),
    contextWindow: z.number(),
    maxOutputTokens: z.number(),
  }),
)

// ============================================================================
// Output Format Types
// ============================================================================

export const OutputFormatTypeSchema = lazySchema(() => z.literal('json_schema'))

export const BaseOutputFormatSchema = lazySchema(() =>
  z.object({
    type: OutputFormatTypeSchema(),
  }),
)

export const JsonSchemaOutputFormatSchema = lazySchema(() =>
  z.object({
    type: z.literal('json_schema'),
    schema: z.record(z.string(), z.unknown()),
  }),
)

export const OutputFormatSchema = lazySchema(() =>
  JsonSchemaOutputFormatSchema(),
)

// ============================================================================
// Config Types
// ============================================================================

export const ApiKeySourceSchema = lazySchema(() =>
  z.enum(['user', 'project', 'org', 'temporary', 'oauth']),
)

export const ConfigScopeSchema = lazySchema(() =>
  z.enum(['local', 'user', 'project']).describe('Config scope for settings.'),
)

export const SdkBetaSchema = lazySchema(() =>
  z.literal('context-1m-2025-08-07'),
)

export const ThinkingAdaptiveSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('adaptive'),
    })
    .describe('Claude decides when and how much to think (Opus 4.6+).'),
)

export const ThinkingEnabledSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('enabled'),
      budgetTokens: z.number().optional(),
    })
    .describe('Fixed thinking token budget (older models)'),
)

export const ThinkingDisabledSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('disabled'),
    })
    .describe('No extended thinking'),
)

export const ThinkingConfigSchema = lazySchema(() =>
  z
    .union([
      ThinkingAdaptiveSchema(),
      ThinkingEnabledSchema(),
      ThinkingDisabledSchema(),
    ])
    .describe(
      "Controls Claude's thinking/reasoning behavior. When set, takes precedence over the deprecated maxThinkingTokens.",
    ),
)

// ============================================================================
// MCP Server Config Types (serializable only)
// ============================================================================

export const McpStdioServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('stdio').optional(), // Optional for backwards compatibility
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
)

export const McpSSEServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
)

export const McpHttpServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
)

export const McpSdkServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('sdk'),
    name: z.string(),
  }),
)

export const McpServerConfigForProcessTransportSchema = lazySchema(() =>
  z.union([
    McpStdioServerConfigSchema(),
    McpSSEServerConfigSchema(),
    McpHttpServerConfigSchema(),
    McpSdkServerConfigSchema(),
  ]),
)

export const McpClaudeAIProxyServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('claudeai-proxy'),
    url: z.string(),
    id: z.string(),
  }),
)

// Broader config type for status responses (includes claudeai-proxy which is output-only)
export const McpServerStatusConfigSchema = lazySchema(() =>
  z.union([
    McpServerConfigForProcessTransportSchema(),
    McpClaudeAIProxyServerConfigSchema(),
  ]),
)

export const McpServerStatusSchema = lazySchema(() =>
  z
    .object({
      name: z.string().describe('按配置设置的服务器名称'),
      status: z
        .enum(['connected', 'failed', 'needs-auth', 'pending', 'disabled'])
        .describe('当前连接状态'),
      serverInfo: z
        .object({
          name: z.string(),
          version: z.string(),
        })
        .optional()
        .describe('服务器信息（连接时可用）'),
      error: z
        .string()
        .optional()
        .describe('错误消息（状态为 \'failed\' 时可用）'),
      config: McpServerStatusConfigSchema()
        .optional()
        .describe('服务器配置（包含 HTTP/SSE 服务器的 URL）'),
      scope: z
        .string()
        .optional()
        .describe(
          '配置范围（例如 project、user、local、claudeai、managed）',
        ),
      tools: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            annotations: z
              .object({
                readOnly: z.boolean().optional(),
                destructive: z.boolean().optional(),
                openWorld: z.boolean().optional(),
              })
              .optional(),
          }),
        )
        .optional()
        .describe('此服务器提供的工具（连接时可用）'),
      capabilities: z
        .object({
          experimental: z.record(z.string(), z.unknown()).optional(),
        })
        .optional()
        .describe(
          '@internal 服务器能力（连接时可用）。experimental[\'claude/channel\'] 仅在服务器的插件位于批准的频道允许列表时存在 — 用其存在来决定是否显示启用频道提示。',
        ),
    })
    .describe('MCP 服务器连接的状态信息。'),
)

export const McpSetServersResultSchema = lazySchema(() =>
  z
    .object({
      added: z.array(z.string()).describe('已添加的服务器名称'),
      removed: z
        .array(z.string())
        .describe('已移除的服务器名称'),
      errors: z
        .record(z.string(), z.string())
        .describe(
          '连接失败的服务器的名称到错误消息的映射',
        ),
    })
    .describe('setMcpServers 操作的结果。'),
)

// ============================================================================
// Permission Types
// ============================================================================

export const PermissionUpdateDestinationSchema = lazySchema(() =>
  z.enum([
    'userSettings',
    'projectSettings',
    'localSettings',
    'session',
    'cliArg',
  ]),
)

export const PermissionBehaviorSchema = lazySchema(() =>
  z.enum(['allow', 'deny', 'ask']),
)

export const PermissionRuleValueSchema = lazySchema(() =>
  z.object({
    toolName: z.string(),
    ruleContent: z.string().optional(),
  }),
)

export const PermissionUpdateSchema = lazySchema(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('addRules'),
      rules: z.array(PermissionRuleValueSchema()),
      behavior: PermissionBehaviorSchema(),
      destination: PermissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('replaceRules'),
      rules: z.array(PermissionRuleValueSchema()),
      behavior: PermissionBehaviorSchema(),
      destination: PermissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('removeRules'),
      rules: z.array(PermissionRuleValueSchema()),
      behavior: PermissionBehaviorSchema(),
      destination: PermissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('setMode'),
      mode: z.lazy(() => PermissionModeSchema()),
      destination: PermissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('addDirectories'),
      directories: z.array(z.string()),
      destination: PermissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('removeDirectories'),
      directories: z.array(z.string()),
      destination: PermissionUpdateDestinationSchema(),
    }),
  ]),
)

export const PermissionDecisionClassificationSchema = lazySchema(() =>
  z
    .enum(['user_temporary', 'user_permanent', 'user_reject'])
    .describe(
      'Classification of this permission decision for telemetry. SDK hosts ' +
        '提示用户的客户端（桌面应用、IDE）应将其设置为反映实际发生的情况：user_temporary 表示允许一次，user_permanent ' +
        '表示始终允许（点击和后续缓存命中），user_reject ' +
        '表示拒绝。如果未设置，CLI 会保守推断（' +
        '允许时为临时，拒绝时为拒绝）。词汇与 tool_decision OTel ' +
        '事件匹配（监控使用文档）。',
    ),
)

export const PermissionResultSchema = lazySchema(() =>
  z.union([
    z.object({
      behavior: z.literal('allow'),
      // Optional - may not be provided if hook sets permission without input modification
      updatedInput: z.record(z.string(), z.unknown()).optional(),
      updatedPermissions: z.array(PermissionUpdateSchema()).optional(),
      toolUseID: z.string().optional(),
      decisionClassification:
        PermissionDecisionClassificationSchema().optional(),
    }),
    z.object({
      behavior: z.literal('deny'),
      message: z.string(),
      interrupt: z.boolean().optional(),
      toolUseID: z.string().optional(),
      decisionClassification:
        PermissionDecisionClassificationSchema().optional(),
    }),
  ]),
)

export const PermissionModeSchema = lazySchema(() =>
  z
    .enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'])
    .describe(
      '控制工具执行处理方式的权限模式。' +
        "'default' - 标准行为，提示危险操作。" +
        "'acceptEdits' - 自动接受文件编辑操作。" +
        "'bypassPermissions' - 绕过所有权限检查（需要 allowDangerouslySkipPermissions）。" +
        "'plan' - 计划模式，不实际执行工具。" +
        "'dontAsk' - 不提示权限，如果未预先批准则拒绝。",
    ),
)


// ============================================================================
// Hook Types
// ============================================================================

export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'Elicitation',
  'ElicitationResult',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
  'CwdChanged',
  'FileChanged',
] as const

export const HookEventSchema = lazySchema(() => z.enum(HOOK_EVENTS))

export const BaseHookInputSchema = lazySchema(() =>
  z.object({
    session_id: z.string(),
    transcript_path: z.string(),
    cwd: z.string(),
    permission_mode: z.string().optional(),
    agent_id: z
      .string()
      .optional()
      .describe(
        'Subagent identifier. Present only when the hook fires from within a subagent ' +
          '(e.g., a tool called by an AgentTool worker). Absent for the main thread, ' +
          'even in --agent sessions. Use this field (not agent_type) to distinguish ' +
          'subagent calls from main-thread calls.',
      ),
    agent_type: z
      .string()
      .optional()
      .describe(
        '代理类型名称（例如 "general-purpose"、"code-reviewer"）。当' +
          '钩子在子代理内触发时存在（与 agent_id 一起），或在主线程上' +
          '通过 --agent 启动的会话（不带 agent_id）。',
      ),
  }),
)

// Use .and() instead of .extend() to preserve BaseHookInput & {...} in generated types
export const PreToolUseHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('PreToolUse'),
      tool_name: z.string(),
      tool_input: z.unknown(),
      tool_use_id: z.string(),
    }),
  ),
)

export const PermissionRequestHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('PermissionRequest'),
      tool_name: z.string(),
      tool_input: z.unknown(),
      permission_suggestions: z.array(PermissionUpdateSchema()).optional(),
    }),
  ),
)

export const PostToolUseHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('PostToolUse'),
      tool_name: z.string(),
      tool_input: z.unknown(),
      tool_response: z.unknown(),
      tool_use_id: z.string(),
    }),
  ),
)

export const PostToolUseFailureHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('PostToolUseFailure'),
      tool_name: z.string(),
      tool_input: z.unknown(),
      tool_use_id: z.string(),
      error: z.string(),
      is_interrupt: z.boolean().optional(),
    }),
  ),
)

export const PermissionDeniedHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('PermissionDenied'),
      tool_name: z.string(),
      tool_input: z.unknown(),
      tool_use_id: z.string(),
      reason: z.string(),
    }),
  ),
)

export const NotificationHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('Notification'),
      message: z.string(),
      title: z.string().optional(),
      notification_type: z.string(),
    }),
  ),
)

export const UserPromptSubmitHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('UserPromptSubmit'),
      prompt: z.string(),
    }),
  ),
)

export const SessionStartHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('SessionStart'),
      source: z.enum(['startup', 'resume', 'clear', 'compact']),
      agent_type: z.string().optional(),
      model: z.string().optional(),
    }),
  ),
)

export const SetupHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('Setup'),
      trigger: z.enum(['init', 'maintenance']),
    }),
  ),
)

export const StopHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('Stop'),
      stop_hook_active: z.boolean(),
      last_assistant_message: z
        .string()
        .optional()
        .describe(
          '停止前最后一条助手消息的文本内容。' +
            '避免需要读取和解析转录文件。',
        ),
    }),
  ),
)

export const StopFailureHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('StopFailure'),
      error: SDKAssistantMessageErrorSchema(),
      error_details: z.string().optional(),
      last_assistant_message: z.string().optional(),
    }),
  ),
)

export const SubagentStartHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('SubagentStart'),
      agent_id: z.string(),
      agent_type: z.string(),
    }),
  ),
)

export const SubagentStopHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('SubagentStop'),
      stop_hook_active: z.boolean(),
      agent_id: z.string(),
      agent_transcript_path: z.string(),
      agent_type: z.string(),
      last_assistant_message: z
        .string()
        .optional()
        .describe(
          '停止前最后一条助手消息的文本内容。' +
            '避免需要读取和解析转录文件。',
        ),
    }),
  ),
)

export const PreCompactHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('PreCompact'),
      trigger: z.enum(['manual', 'auto']),
      custom_instructions: z.string().nullable(),
    }),
  ),
)

export const PostCompactHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('PostCompact'),
      trigger: z.enum(['manual', 'auto']),
      compact_summary: z
        .string()
        .describe('压缩产生的对话摘要'),
    }),
  ),
)

export const TeammateIdleHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('TeammateIdle'),
      teammate_name: z.string(),
      team_name: z.string(),
    }),
  ),
)

export const TaskCreatedHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('TaskCreated'),
      task_id: z.string(),
      task_subject: z.string(),
      task_description: z.string().optional(),
      teammate_name: z.string().optional(),
      team_name: z.string().optional(),
    }),
  ),
)

export const TaskCompletedHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('TaskCompleted'),
      task_id: z.string(),
      task_subject: z.string(),
      task_description: z.string().optional(),
      teammate_name: z.string().optional(),
      team_name: z.string().optional(),
    }),
  ),
)

export const ElicitationHookInputSchema = lazySchema(() =>
  BaseHookInputSchema()
    .and(
      z.object({
        hook_event_name: z.literal('Elicitation'),
        mcp_server_name: z.string(),
        message: z.string(),
        mode: z.enum(['form', 'url']).optional(),
        url: z.string().optional(),
        elicitation_id: z.string().optional(),
        requested_schema: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .describe(
      'Hook input for the Elicitation event. Fired when an MCP server requests user input. Hooks can auto-respond (accept/decline) instead of showing the dialog.',
    ),
)

export const ElicitationResultHookInputSchema = lazySchema(() =>
  BaseHookInputSchema()
    .and(
      z.object({
        hook_event_name: z.literal('ElicitationResult'),
        mcp_server_name: z.string(),
        elicitation_id: z.string().optional(),
        mode: z.enum(['form', 'url']).optional(),
        action: z.enum(['accept', 'decline', 'cancel']),
        content: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .describe(
      'Hook input for the ElicitationResult event. Fired after the user responds to an MCP elicitation. Hooks can observe or override the response before it is sent to the server.',
    ),
)

export const CONFIG_CHANGE_SOURCES = [
  'user_settings',
  'project_settings',
  'local_settings',
  'policy_settings',
  'skills',
] as const

export const ConfigChangeHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('ConfigChange'),
      source: z.enum(CONFIG_CHANGE_SOURCES),
      file_path: z.string().optional(),
    }),
  ),
)

export const INSTRUCTIONS_LOAD_REASONS = [
  'session_start',
  'nested_traversal',
  'path_glob_match',
  'include',
  'compact',
] as const

export const INSTRUCTIONS_MEMORY_TYPES = [
  'User',
  'Project',
  'Local',
  'Managed',
] as const

export const InstructionsLoadedHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('InstructionsLoaded'),
      file_path: z.string(),
      memory_type: z.enum(INSTRUCTIONS_MEMORY_TYPES),
      load_reason: z.enum(INSTRUCTIONS_LOAD_REASONS),
      globs: z.array(z.string()).optional(),
      trigger_file_path: z.string().optional(),
      parent_file_path: z.string().optional(),
    }),
  ),
)

export const WorktreeCreateHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('WorktreeCreate'),
      name: z.string(),
    }),
  ),
)

export const WorktreeRemoveHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('WorktreeRemove'),
      worktree_path: z.string(),
    }),
  ),
)

export const CwdChangedHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('CwdChanged'),
      old_cwd: z.string(),
      new_cwd: z.string(),
    }),
  ),
)

export const FileChangedHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('FileChanged'),
      file_path: z.string(),
      event: z.enum(['change', 'add', 'unlink']),
    }),
  ),
)

export const EXIT_REASONS = [
  'clear',
  'resume',
  'logout',
  'prompt_input_exit',
  'other',
  'bypass_permissions_disabled',
] as const

export const ExitReasonSchema = lazySchema(() => z.enum(EXIT_REASONS))

export const SessionEndHookInputSchema = lazySchema(() =>
  BaseHookInputSchema().and(
    z.object({
      hook_event_name: z.literal('SessionEnd'),
      reason: ExitReasonSchema(),
    }),
  ),
)

export const HookInputSchema = lazySchema(() =>
  z.union([
    PreToolUseHookInputSchema(),
    PostToolUseHookInputSchema(),
    PostToolUseFailureHookInputSchema(),
    PermissionDeniedHookInputSchema(),
    NotificationHookInputSchema(),
    UserPromptSubmitHookInputSchema(),
    SessionStartHookInputSchema(),
    SessionEndHookInputSchema(),
    StopHookInputSchema(),
    StopFailureHookInputSchema(),
    SubagentStartHookInputSchema(),
    SubagentStopHookInputSchema(),
    PreCompactHookInputSchema(),
    PostCompactHookInputSchema(),
    PermissionRequestHookInputSchema(),
    SetupHookInputSchema(),
    TeammateIdleHookInputSchema(),
    TaskCreatedHookInputSchema(),
    TaskCompletedHookInputSchema(),
    ElicitationHookInputSchema(),
    ElicitationResultHookInputSchema(),
    ConfigChangeHookInputSchema(),
    InstructionsLoadedHookInputSchema(),
    WorktreeCreateHookInputSchema(),
    WorktreeRemoveHookInputSchema(),
    CwdChangedHookInputSchema(),
    FileChangedHookInputSchema(),
  ]),
)

export const AsyncHookJSONOutputSchema = lazySchema(() =>
  z.object({
    async: z.literal(true),
    asyncTimeout: z.number().optional(),
  }),
)

export const PreToolUseHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('PreToolUse'),
    permissionDecision: PermissionBehaviorSchema().optional(),
    permissionDecisionReason: z.string().optional(),
    updatedInput: z.record(z.string(), z.unknown()).optional(),
    additionalContext: z.string().optional(),
  }),
)

export const UserPromptSubmitHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('UserPromptSubmit'),
    additionalContext: z.string().optional(),
  }),
)

export const SessionStartHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('SessionStart'),
    additionalContext: z.string().optional(),
    initialUserMessage: z.string().optional(),
    watchPaths: z.array(z.string()).optional(),
  }),
)

export const SetupHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('Setup'),
    additionalContext: z.string().optional(),
  }),
)

export const SubagentStartHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('SubagentStart'),
    additionalContext: z.string().optional(),
  }),
)

export const PostToolUseHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('PostToolUse'),
    additionalContext: z.string().optional(),
    updatedMCPToolOutput: z.unknown().optional(),
  }),
)

export const PostToolUseFailureHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('PostToolUseFailure'),
    additionalContext: z.string().optional(),
  }),
)

export const PermissionDeniedHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('PermissionDenied'),
    retry: z.boolean().optional(),
  }),
)

export const NotificationHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('Notification'),
    additionalContext: z.string().optional(),
  }),
)

export const PermissionRequestHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('PermissionRequest'),
    decision: z.union([
      z.object({
        behavior: z.literal('allow'),
        updatedInput: z.record(z.string(), z.unknown()).optional(),
        updatedPermissions: z.array(PermissionUpdateSchema()).optional(),
      }),
      z.object({
        behavior: z.literal('deny'),
        message: z.string().optional(),
        interrupt: z.boolean().optional(),
      }),
    ]),
  }),
)

export const CwdChangedHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('CwdChanged'),
    watchPaths: z.array(z.string()).optional(),
  }),
)

export const FileChangedHookSpecificOutputSchema = lazySchema(() =>
  z.object({
    hookEventName: z.literal('FileChanged'),
    watchPaths: z.array(z.string()).optional(),
  }),
)

export const SyncHookJSONOutputSchema = lazySchema(() =>
  z.object({
    continue: z.boolean().optional(),
    suppressOutput: z.boolean().optional(),
    stopReason: z.string().optional(),
    decision: z.enum(['approve', 'block']).optional(),
    systemMessage: z.string().optional(),
    reason: z.string().optional(),
    hookSpecificOutput: z
      .union([
        PreToolUseHookSpecificOutputSchema(),
        UserPromptSubmitHookSpecificOutputSchema(),
        SessionStartHookSpecificOutputSchema(),
        SetupHookSpecificOutputSchema(),
        SubagentStartHookSpecificOutputSchema(),
        PostToolUseHookSpecificOutputSchema(),
        PostToolUseFailureHookSpecificOutputSchema(),
        PermissionDeniedHookSpecificOutputSchema(),
        NotificationHookSpecificOutputSchema(),
        PermissionRequestHookSpecificOutputSchema(),
        ElicitationHookSpecificOutputSchema(),
        ElicitationResultHookSpecificOutputSchema(),
        CwdChangedHookSpecificOutputSchema(),
        FileChangedHookSpecificOutputSchema(),
        WorktreeCreateHookSpecificOutputSchema(),
      ])
      .optional(),
  }),
)

export const ElicitationHookSpecificOutputSchema = lazySchema(() =>
  z
    .object({
      hookEventName: z.literal('Elicitation'),
      action: z.enum(['accept', 'decline', 'cancel']).optional(),
      content: z.record(z.string(), z.unknown()).optional(),
    })
    .describe(
      'Hook-specific output for the Elicitation event. Return this to programmatically accept or decline an MCP elicitation request.',
    ),
)

export const ElicitationResultHookSpecificOutputSchema = lazySchema(() =>
  z
    .object({
      hookEventName: z.literal('ElicitationResult'),
      action: z.enum(['accept', 'decline', 'cancel']).optional(),
      content: z.record(z.string(), z.unknown()).optional(),
    })
    .describe(
      'Hook-specific output for the ElicitationResult event. Return this to override the action or content before the response is sent to the MCP server.',
    ),
)

export const WorktreeCreateHookSpecificOutputSchema = lazySchema(() =>
  z
    .object({
      hookEventName: z.literal('WorktreeCreate'),
      worktreePath: z.string(),
    })
    .describe(
      'Hook-specific output for the WorktreeCreate event. Provides the absolute path to the created worktree directory. Command hooks print the path on stdout instead.',
    ),
)

export const HookJSONOutputSchema = lazySchema(() =>
  z.union([AsyncHookJSONOutputSchema(), SyncHookJSONOutputSchema()]),
)

export const PromptRequestOptionSchema = lazySchema(() =>
  z.object({
    key: z
      .string()
      .describe('Unique key for this option, returned in the response'),
    label: z.string().describe('Display text for this option'),
    description: z
      .string()
      .optional()
      .describe('标签下方显示的可选描述'),
  }),
)

export const PromptRequestSchema = lazySchema(() =>
  z.object({
    prompt: z
      .string()
      .describe(
        '请求 ID。此键的存在将此行标记为提示请求。',
      ),
    message: z.string().describe('向用户显示的提示消息'),
    options: z
      .array(PromptRequestOptionSchema())
      .describe('供用户选择的可用选项'),
  }),
)

export const PromptResponseSchema = lazySchema(() =>
  z.object({
    prompt_response: z
      .string()
      .describe('对应提示请求中的请求 ID'),
    selected: z.string().describe('所选选项的键'),
  }),
)

// ============================================================================
// Skill/Command Types
// ============================================================================

export const SlashCommandSchema = lazySchema(() =>
  z
    .object({
      name: z.string().describe('技能名称（不带前导斜杠）'),
      description: z.string().describe('技能的作用描述'),
      argumentHint: z
        .string()
        .describe('技能参数提示（例如 "<file>"）'),
    })
    .describe(
      '可用技能的信息（通过 /command 语法调用）。',
    ),
)

export const AgentInfoSchema = lazySchema(() =>
  z
    .object({
      name: z.string().describe('代理类型标识符（例如 "Explore"）'),
      description: z.string().describe('何时使用此代理的描述'),
      model: z
        .string()
        .optional()
        .describe(
          '此代理使用的模型别名。如果省略，则继承父级的模型',
        ),
    })
    .describe(
      '可通过 Task 工具调用的可用子代理的信息。',
    ),
)

export const ModelInfoSchema = lazySchema(() =>
  z
    .object({
      value: z.string().describe('API 调用中使用的模型标识符'),
      displayName: z.string().describe('人类可读的显示名称'),
      description: z
        .string()
        .describe('模型能力的描述'),
      supportsEffort: z
        .boolean()
        .optional()
        .describe('此模型是否支持努力程度设置'),
      supportedEffortLevels: z
        .array(z.enum(['low', 'medium', 'high', 'max']))
        .optional()
        .describe('此模型的可用努力程度'),
      supportsAdaptiveThinking: z
        .boolean()
        .optional()
        .describe(
          '此模型是否支持自适应思考（Claude 决定何时以及思考多少）',
        ),
      supportsFastMode: z
        .boolean()
        .optional()
        .describe('此模型是否支持快速模式'),
      supportsAutoMode: z
        .boolean()
        .optional()
        .describe('此模型是否支持自动模式'),
    })
    .describe('可用模型的信息。'),
)

export const AccountInfoSchema = lazySchema(() =>
  z
    .object({
      email: z.string().optional(),
      organization: z.string().optional(),
      subscriptionType: z.string().optional(),
      tokenSource: z.string().optional(),
      apiKeySource: z.string().optional(),
      apiProvider: z
        .enum(['firstParty', 'bedrock', 'vertex', 'foundry'])
        .optional()
        .describe(
          '当前使用的 API 后端。仅在 "firstParty" 时使用 Anthropic OAuth 登录；对于第三方提供商，其他字段不存在且身份验证是外部的（AWS 凭证、gcloud ADC 等）。',
        ),
    })
    .describe('已登录用户账户的信息。'),
)

// ============================================================================
// Agent Definition Types
// ============================================================================

export const AgentMcpServerSpecSchema = lazySchema(() =>
  z.union([
    z.string(),
    z.record(z.string(), McpServerConfigForProcessTransportSchema()),
  ]),
)

export const AgentDefinitionSchema = lazySchema(() =>
  z
    .object({
      description: z
        .string()
        .describe('何时使用此代理的自然语言描述'),
      tools: z
        .array(z.string())
        .optional()
        .describe(
          '允许的工具名称数组。如果省略，则继承父级的所有工具',
        ),
      disallowedTools: z
        .array(z.string())
        .optional()
        .describe('明确禁止此代理使用的工具名称数组'),
      prompt: z.string().describe('代理的系统提示词'),
      model: z
        .string()
        .optional()
        .describe(
          "模型别名（例如 'sonnet'、'opus'、'haiku'）或完整模型 ID（例如 'claude-opus-4-5'）。如果省略或为 'inherit'，则使用主模型",
        ),
      mcpServers: z.array(AgentMcpServerSpecSchema()).optional(),
      criticalSystemReminder_EXPERIMENTAL: z
        .string()
        .optional()
        .describe('实验性：添加到系统提示词中的关键提醒'),
      skills: z
        .array(z.string())
        .optional()
        .describe('要预加载到代理上下文中的技能名称数组'),
      initialPrompt: z
        .string()
        .optional()
        .describe(
          '当此代理作为主线程代理时，自动作为第一个用户回合提交。斜杠命令会被处理。添加到用户提供的提示词之前。',
        ),
      maxTurns: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          '停止前的最大代理轮次（API 往返次数）',
        ),
      background: z
        .boolean()
        .optional()
        .describe(
          '调用时将此代理作为后台任务运行（非阻塞、即发即忘）',
        ),
      memory: z
        .enum(['user', 'project', 'local'])
        .optional()
        .describe(
          "自动加载代理内存文件的作用域。'user' - ~/.claude/agent-memory/<agentType>/，'project' - .claude/agent-memory/<agentType>/，'local' - .claude/agent-memory-local/<agentType>/",
        ),
      effort: z
        .union([z.enum(['low', 'medium', 'high', 'max']), z.number().int()])
        .optional()
        .describe(
          '此代理的推理努力程度。可以是命名级别或整数',
        ),
      permissionMode: PermissionModeSchema()
        .optional()
        .describe(
          '控制工具执行处理方式的权限模式',
        ),
    })
    .describe(
      '可通过 Agent 工具调用的自定义子代理的定义。',
    ),
)

// ============================================================================
// Settings Types
// ============================================================================

export const SettingSourceSchema = lazySchema(() =>
  z
    .enum(['user', 'project', 'local'])
    .describe(
      '用于加载基于文件系统设置的来源。' +
        "'user' - 全局用户设置（~/.claude/settings.json）。" +
        "'project' - 项目设置（.claude/settings.json）。" +
        "'local' - 本地设置（.claude/settings.local.json）。",
    ),
)

export const SdkPluginConfigSchema = lazySchema(() =>
  z
    .object({
      type: z
        .literal('local')
        .describe("插件类型。目前仅支持 'local'"),
      path: z
        .string()
        .describe('插件目录的绝对或相对路径'),
    })
    .describe('用于加载插件的配置。'),
)

// ============================================================================
// Rewind Types
// ============================================================================

export const RewindFilesResultSchema = lazySchema(() =>
  z
    .object({
      canRewind: z.boolean(),
      error: z.string().optional(),
      filesChanged: z.array(z.string()).optional(),
      insertions: z.number().optional(),
      deletions: z.number().optional(),
    })
    .describe('rewindFiles 操作的结果。'),
)

// ============================================================================
// External Type Placeholders
// ============================================================================
//
// These schemas use z.unknown() as placeholders for external types.
// The generation script uses TypeOverrideMap to output the correct TS type references.
// This allows us to define SDK message types in Zod while maintaining proper typing.

/** Placeholder for APIUserMessage from @anthropic-ai/sdk */
export const APIUserMessagePlaceholder = lazySchema(() => z.unknown())

/** Placeholder for APIAssistantMessage from @anthropic-ai/sdk */
export const APIAssistantMessagePlaceholder = lazySchema(() => z.unknown())

/** Placeholder for RawMessageStreamEvent from @anthropic-ai/sdk */
export const RawMessageStreamEventPlaceholder = lazySchema(() => z.unknown())

/** Placeholder for UUID from crypto */
export const UUIDPlaceholder = lazySchema(() => z.string())

/** Placeholder for NonNullableUsage (mapped type over Usage) */
export const NonNullableUsagePlaceholder = lazySchema(() => z.unknown())

// ============================================================================
// SDK Message Types
// ============================================================================

export const SDKAssistantMessageErrorSchema = lazySchema(() =>
  z.enum([
    'authentication_failed',
    'billing_error',
    'rate_limit',
    'invalid_request',
    'server_error',
    'unknown',
    'max_output_tokens',
  ]),
)

export const SDKStatusSchema = lazySchema(() =>
  z.union([z.literal('compacting'), z.null()]),
)

// SDKUserMessage content without uuid/session_id
const SDKUserMessageContentSchema = lazySchema(() =>
  z.object({
    type: z.literal('user'),
    message: APIUserMessagePlaceholder(),
    parent_tool_use_id: z.string().nullable(),
    isSynthetic: z.boolean().optional(),
    tool_use_result: z.unknown().optional(),
    priority: z.enum(['now', 'next', 'later']).optional(),
    timestamp: z
      .string()
      .optional()
      .describe(
        'ISO timestamp when the message was created on the originating process. Older emitters omit it; consumers should fall back to receive time.',
      ),
  }),
)

export const SDKUserMessageSchema = lazySchema(() =>
  SDKUserMessageContentSchema().extend({
    uuid: UUIDPlaceholder().optional(),
    session_id: z.string().optional(),
  }),
)

export const SDKUserMessageReplaySchema = lazySchema(() =>
  SDKUserMessageContentSchema().extend({
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
    isReplay: z.literal(true),
  }),
)

export const SDKRateLimitInfoSchema = lazySchema(() =>
  z
    .object({
      status: z.enum(['allowed', 'allowed_warning', 'rejected']),
      resetsAt: z.number().optional(),
      rateLimitType: z
        .enum([
          'five_hour',
          'seven_day',
          'seven_day_opus',
          'seven_day_sonnet',
          'overage',
        ])
        .optional(),
      utilization: z.number().optional(),
      overageStatus: z
        .enum(['allowed', 'allowed_warning', 'rejected'])
        .optional(),
      overageResetsAt: z.number().optional(),
      overageDisabledReason: z
        .enum([
          'overage_not_provisioned',
          'org_level_disabled',
          'org_level_disabled_until',
          'out_of_credits',
          'seat_tier_level_disabled',
          'member_level_disabled',
          'seat_tier_zero_credit_limit',
          'group_zero_credit_limit',
          'member_zero_credit_limit',
          'org_service_level_disabled',
          'org_service_zero_credit_limit',
          'no_limits_configured',
          'unknown',
        ])
        .optional(),
      isUsingOverage: z.boolean().optional(),
      surpassedThreshold: z.number().optional(),
    })
    .describe('Rate limit information for claude.ai subscription users.'),
)

export const SDKAssistantMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('assistant'),
    message: APIAssistantMessagePlaceholder(),
    parent_tool_use_id: z.string().nullable(),
    error: SDKAssistantMessageErrorSchema().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKRateLimitEventSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('rate_limit_event'),
      rate_limit_info: SDKRateLimitInfoSchema(),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe('速率限制信息变化时发出的速率限制事件。'),
)

export const SDKStreamlinedTextMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('streamlined_text'),
      text: z
        .string()
        .describe('从助手消息保留的文本内容'),
      session_id: z.string(),
      uuid: UUIDPlaceholder(),
    })
    .describe(
      '@internal 精简文本消息 — 在精简输出中替代 SDKAssistantMessage。保留文本内容，移除思考和 tool_use 块。',
    ),
)

export const SDKStreamlinedToolUseSummaryMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('streamlined_tool_use_summary'),
      tool_summary: z
        .string()
        .describe('工具调用摘要（例如 "读取 2 个文件，写入 1 个文件"）'),
      session_id: z.string(),
      uuid: UUIDPlaceholder(),
    })
    .describe(
      '@internal 精简工具使用摘要 — 在精简输出中用累积摘要字符串替代 tool_use 块。',
    ),
)

export const SDKPermissionDenialSchema = lazySchema(() =>
  z.object({
    tool_name: z.string(),
    tool_use_id: z.string(),
    tool_input: z.record(z.string(), z.unknown()),
  }),
)

export const SDKResultSuccessSchema = lazySchema(() =>
  z.object({
    type: z.literal('result'),
    subtype: z.literal('success'),
    duration_ms: z.number(),
    duration_api_ms: z.number(),
    is_error: z.boolean(),
    num_turns: z.number(),
    result: z.string(),
    stop_reason: z.string().nullable(),
    total_cost_usd: z.number(),
    usage: NonNullableUsagePlaceholder(),
    modelUsage: z.record(z.string(), ModelUsageSchema()),
    permission_denials: z.array(SDKPermissionDenialSchema()),
    structured_output: z.unknown().optional(),
    fast_mode_state: FastModeStateSchema().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKResultErrorSchema = lazySchema(() =>
  z.object({
    type: z.literal('result'),
    subtype: z.enum([
      'error_during_execution',
      'error_max_turns',
      'error_max_budget_usd',
      'error_max_structured_output_retries',
    ]),
    duration_ms: z.number(),
    duration_api_ms: z.number(),
    is_error: z.boolean(),
    num_turns: z.number(),
    stop_reason: z.string().nullable(),
    total_cost_usd: z.number(),
    usage: NonNullableUsagePlaceholder(),
    modelUsage: z.record(z.string(), ModelUsageSchema()),
    permission_denials: z.array(SDKPermissionDenialSchema()),
    errors: z.array(z.string()),
    fast_mode_state: FastModeStateSchema().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKResultMessageSchema = lazySchema(() =>
  z.union([SDKResultSuccessSchema(), SDKResultErrorSchema()]),
)

export const SDKSystemMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('init'),
    agents: z.array(z.string()).optional(),
    apiKeySource: ApiKeySourceSchema(),
    betas: z.array(z.string()).optional(),
    claude_code_version: z.string(),
    cwd: z.string(),
    tools: z.array(z.string()),
    mcp_servers: z.array(
      z.object({
        name: z.string(),
        status: z.string(),
      }),
    ),
    model: z.string(),
    permissionMode: PermissionModeSchema(),
    slash_commands: z.array(z.string()),
    output_style: z.string(),
    skills: z.array(z.string()),
    plugins: z.array(
      z.object({
        name: z.string(),
        path: z.string(),
        source: z
          .string()
          .optional()
          .describe(
            '@internal Plugin source identifier in "name\\@marketplace" format. Sentinels: "name\\@inline" for --plugin-dir, "name\\@builtin" for built-in plugins.',
          ),
      }),
    ),
    fast_mode_state: FastModeStateSchema().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKPartialAssistantMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('stream_event'),
    event: RawMessageStreamEventPlaceholder(),
    parent_tool_use_id: z.string().nullable(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKCompactBoundaryMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('compact_boundary'),
    compact_metadata: z.object({
      trigger: z.enum(['manual', 'auto']),
      pre_tokens: z.number(),
      preserved_segment: z
        .object({
          head_uuid: UUIDPlaceholder(),
          anchor_uuid: UUIDPlaceholder(),
          tail_uuid: UUIDPlaceholder(),
        })
        .optional()
        .describe(
          'Relink info for messagesToKeep. Loaders splice the preserved ' +
            '锚定在 anchor_uuid 的段（保留后缀的摘要，' +
            '保留前缀的部分压缩的边界），以便恢复 ' +
            '包含保留的内容。当压缩总结 ' +
            '所有内容时未设置（没有 messagesToKeep）。',
        ),
    }),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKStatusMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('status'),
    status: SDKStatusSchema(),
    permissionMode: PermissionModeSchema().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKPostTurnSummaryMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('system'),
      subtype: z.literal('post_turn_summary'),
      summarizes_uuid: z.string(),
      status_category: z.enum([
        'blocked',
        'waiting',
        'completed',
        'review_ready',
        'failed',
      ]),
      status_detail: z.string(),
      is_noteworthy: z.boolean(),
      title: z.string(),
      description: z.string(),
      recent_action: z.string(),
      needs_action: z.string(),
      artifact_urls: z.array(z.string()),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      '@internal Background post-turn summary emitted after each assistant turn. summarizes_uuid points to the assistant message this summarizes.',
    ),
)

export const SDKAPIRetryMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('system'),
      subtype: z.literal('api_retry'),
      attempt: z.number(),
      max_retries: z.number(),
      retry_delay_ms: z.number(),
      error_status: z.number().nullable(),
      error: SDKAssistantMessageErrorSchema(),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      'Emitted when an API request fails with a retryable error and will be retried after a delay. error_status is null for connection errors (e.g. timeouts) that had no HTTP response.',
    ),
)

export const SDKLocalCommandOutputMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('system'),
      subtype: z.literal('local_command_output'),
      content: z.string(),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      'Output from a local slash command (e.g. /voice, /cost). Displayed as assistant-style text in the transcript.',
    ),
)

export const SDKHookStartedMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('hook_started'),
    hook_id: z.string(),
    hook_name: z.string(),
    hook_event: z.string(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKHookProgressMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('hook_progress'),
    hook_id: z.string(),
    hook_name: z.string(),
    hook_event: z.string(),
    stdout: z.string(),
    stderr: z.string(),
    output: z.string(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKHookResponseMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('hook_response'),
    hook_id: z.string(),
    hook_name: z.string(),
    hook_event: z.string(),
    output: z.string(),
    stdout: z.string(),
    stderr: z.string(),
    exit_code: z.number().optional(),
    outcome: z.enum(['success', 'error', 'cancelled']),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKToolProgressMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('tool_progress'),
    tool_use_id: z.string(),
    tool_name: z.string(),
    parent_tool_use_id: z.string().nullable(),
    elapsed_time_seconds: z.number(),
    task_id: z.string().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKAuthStatusMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('auth_status'),
    isAuthenticating: z.boolean(),
    output: z.array(z.string()),
    error: z.string().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKFilesPersistedEventSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('files_persisted'),
    files: z.array(
      z.object({
        filename: z.string(),
        file_id: z.string(),
      }),
    ),
    failed: z.array(
      z.object({
        filename: z.string(),
        error: z.string(),
      }),
    ),
    processed_at: z.string(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKTaskNotificationMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('task_notification'),
    task_id: z.string(),
    tool_use_id: z.string().optional(),
    status: z.enum(['completed', 'failed', 'stopped']),
    output_file: z.string(),
    summary: z.string(),
    usage: z
      .object({
        total_tokens: z.number(),
        tool_uses: z.number(),
        duration_ms: z.number(),
      })
      .optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKTaskStartedMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('task_started'),
    task_id: z.string(),
    tool_use_id: z.string().optional(),
    description: z.string(),
    task_type: z.string().optional(),
    workflow_name: z
      .string()
      .optional()
      .describe(
        "meta.name from the workflow script (e.g. 'spec'). Only set when task_type is 'local_workflow'.",
      ),
    prompt: z.string().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKSessionStateChangedMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('system'),
      subtype: z.literal('session_state_changed'),
      state: z.enum(['idle', 'running', 'requires_action']),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      "Mirrors notifySessionStateChanged. 'idle' fires after heldBackResult flushes and the bg-agent do-while exits — authoritative turn-over signal.",
    ),
)


export const SDKTaskProgressMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('system'),
    subtype: z.literal('task_progress'),
    task_id: z.string(),
    tool_use_id: z.string().optional(),
    description: z.string(),
    usage: z.object({
      total_tokens: z.number(),
      tool_uses: z.number(),
      duration_ms: z.number(),
    }),
    last_tool_name: z.string().optional(),
    summary: z.string().optional(),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKToolUseSummaryMessageSchema = lazySchema(() =>
  z.object({
    type: z.literal('tool_use_summary'),
    summary: z.string(),
    preceding_tool_use_ids: z.array(z.string()),
    uuid: UUIDPlaceholder(),
    session_id: z.string(),
  }),
)

export const SDKElicitationCompleteMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('system'),
      subtype: z.literal('elicitation_complete'),
      mcp_server_name: z.string(),
      elicitation_id: z.string(),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      'Emitted when an MCP server confirms that a URL-mode elicitation is complete.',
    ),
)

/** @internal */
export const SDKPromptSuggestionMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('prompt_suggestion'),
      suggestion: z.string(),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      'Predicted next user prompt, emitted after each turn when promptSuggestions is enabled.',
    ),
)

// ============================================================================
// Session Listing Types
// ============================================================================

export const SDKSessionInfoSchema = lazySchema(() =>
  z
    .object({
      sessionId: z.string().describe('唯一会话标识符（UUID）。'),
      summary: z
        .string()
        .describe(
          '会话的显示标题：自定义标题、自动生成的摘要或首个提示。',
        ),
      lastModified: z
        .number()
        .describe('最后修改时间（自纪元以来的毫秒数）。'),
      fileSize: z
        .number()
        .optional()
        .describe(
          '文件大小（字节）。仅为本地 JSONL 存储时填充。',
        ),
      customTitle: z
        .string()
        .optional()
        .describe('用户通过 /rename 设置的会话标题。'),
      firstPrompt: z
        .string()
        .optional()
        .describe('会话中首个有意义的用户提示。'),
      gitBranch: z
        .string()
        .optional()
        .describe('会话结束时的 Git 分支。'),
      cwd: z.string().optional().describe('会话的工作目录。'),
      tag: z.string().optional().describe('用户设置的会话标签。'),
      createdAt: z
        .number()
        .optional()
        .describe(
          '创建时间（自纪元以来的毫秒数），从首个条目的时间戳提取。',
        ),
    })
    .describe('listSessions 和 getSessionInfo 返回的会话元数据。'),
)

export const SDKMessageSchema = lazySchema(() =>
  z.union([
    SDKAssistantMessageSchema(),
    SDKUserMessageSchema(),
    SDKUserMessageReplaySchema(),
    SDKResultMessageSchema(),
    SDKSystemMessageSchema(),
    SDKPartialAssistantMessageSchema(),
    SDKCompactBoundaryMessageSchema(),
    SDKStatusMessageSchema(),
    SDKAPIRetryMessageSchema(),
    SDKLocalCommandOutputMessageSchema(),
    SDKHookStartedMessageSchema(),
    SDKHookProgressMessageSchema(),
    SDKHookResponseMessageSchema(),
    SDKToolProgressMessageSchema(),
    SDKAuthStatusMessageSchema(),
    SDKTaskNotificationMessageSchema(),
    SDKTaskStartedMessageSchema(),
    SDKTaskProgressMessageSchema(),
    SDKSessionStateChangedMessageSchema(),
    SDKFilesPersistedEventSchema(),
    SDKToolUseSummaryMessageSchema(),
    SDKRateLimitEventSchema(),
    SDKElicitationCompleteMessageSchema(),
    SDKPromptSuggestionMessageSchema(),
  ]),
)

export const FastModeStateSchema = lazySchema(() =>
  z
    .enum(['off', 'cooldown', 'on'])
    .describe(
      'Fast mode state: off, in cooldown after rate limit, or actively enabled.',
    ),
)
