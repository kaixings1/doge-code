import memoize from 'lodash-es/memoize.js'
import type { HookEvent } from '../../entrypoints/agentSdkTypes.js'
import { getRegisteredHooks } from '../../bootstrap/state.js'
import type { AppState } from '../../state/AppState.js'
import {
  getAllHooks,
  type IndividualHookConfig,
  sortMatchersByPriority,
} from './hooksSettings.js'

export type MatcherMetadata = {
  fieldToMatch: string
  values: string[]
}

export type HookEventMetadata = {
  summary: string
  description: string
  matcherMetadata?: MatcherMetadata
}

// Hook event metadata configuration.
// Resolver uses sorted-joined string key so that callers passing a fresh
// toolNames array each render (e.g. HooksConfigMenu) hit the cache instead
// of leaking a new entry per call.
export const getHookEventMetadata = memoize(
  function (toolNames: string[]): Record<HookEvent, HookEventMetadata> {
    return {
      PreToolUse: {
        summary: '工具执行前',
        description:
          '命令输入为工具调用参数的 JSON。\n退出码 0 - 不显示 stdout/stderr\n退出码 2 - 向模型显示 stderr 并阻止工具调用\n其他退出码 - 仅向用户显示 stderr 但继续工具调用',
        matcherMetadata: {
          fieldToMatch: 'tool_name',
          values: toolNames,
        },
      },
      PostToolUse: {
        summary: '工具执行后',
        description:
          '命令输入为包含 "inputs"（工具调用参数）和 "response"（工具调用响应）的 JSON。\n退出码 0 - 在转录模式（ctrl+o）中显示 stdout\n退出码 2 - 立即向模型显示 stderr\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'tool_name',
          values: toolNames,
        },
      },
      PostToolUseFailure: {
        summary: '工具执行失败后',
        description:
          '命令输入为包含 tool_name、tool_input、tool_use_id、error、error_type、is_interrupt 和 is_timeout 的 JSON。\n退出码 0 - 在转录模式（ctrl+o）中显示 stdout\n退出码 2 - 立即向模型显示 stderr\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'tool_name',
          values: toolNames,
        },
      },
      PermissionDenied: {
        summary: '自动模式分类器拒绝工具调用后',
        description:
          '命令输入为包含 tool_name、tool_input、tool_use_id 和 reason 的 JSON。\n返回 {"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}} 告诉模型可以重试。\n退出码 0 - 在转录模式（ctrl+o）中显示 stdout\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'tool_name',
          values: toolNames,
        },
      },
      Notification: {
        summary: '发送通知时',
        description:
          '命令输入为包含通知消息和类型的 JSON。\n退出码 0 - 不显示 stdout/stderr\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'notification_type',
          values: [
            'permission_prompt',
            'idle_prompt',
            'auth_success',
            'elicitation_dialog',
            'elicitation_complete',
            'elicitation_response',
          ],
        },
      },
      UserPromptSubmit: {
        summary: '用户提交提示词时',
        description:
          '命令输入为包含原始用户提示词文本的 JSON。\n退出码 0 - 向 Claude 显示 stdout\n退出码 2 - 阻止处理，擦除原始提示词，仅向用户显示 stderr\n其他退出码 - 仅向用户显示 stderr',
      },
      SessionStart: {
        summary: '新会话启动时',
        description:
          '命令输入为包含会话启动来源的 JSON。\n退出码 0 - 向 Claude 显示 stdout\n阻塞性错误将被忽略\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'source',
          values: ['startup', 'resume', 'clear', 'compact'],
        },
      },
      Stop: {
        summary: 'Claude 完成响应前',
        description:
          '退出码 0 - 不显示 stdout/stderr\n退出码 2 - 向模型显示 stderr 并继续对话\n其他退出码 - 仅向用户显示 stderr',
      },
      StopFailure: {
        summary: '因 API 错误导致回合结束时',
        description:
          '当 API 错误（速率限制、身份验证失败等）结束回合时触发，而非 Stop。\n即发即忘——钩子输出和退出码将被忽略。',
        matcherMetadata: {
          fieldToMatch: 'error',
          values: [
            'rate_limit',
            'authentication_failed',
            'billing_error',
            'invalid_request',
            'server_error',
            'max_output_tokens',
            'unknown',
          ],
        },
      },
      SubagentStart: {
        summary: '子代理（Agent 工具调用）启动时',
        description:
          '命令输入为包含 agent_id 和 agent_type 的 JSON。\n退出码 0 - 向子代理显示 stdout\n阻塞性错误将被忽略\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'agent_type',
          values: [], // Will be populated with available agent types
        },
      },
      SubagentStop: {
        summary: '子代理（Agent 工具调用）完成响应前',
        description:
          '命令输入为包含 agent_id、agent_type 和 agent_transcript_path 的 JSON。\n退出码 0 - 不显示 stdout/stderr\n退出码 2 - 向子代理显示 stderr 并让其继续运行\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'agent_type',
          values: [], // Will be populated with available agent types
        },
      },
      PreCompact: {
        summary: '对话压缩前',
        description:
          '命令输入为包含压缩详细信息的 JSON。\n退出码 0 - stdout 将作为自定义压缩指令追加\n退出码 2 - 阻止压缩\n其他退出码 - 仅向用户显示 stderr 但继续压缩',
        matcherMetadata: {
          fieldToMatch: 'trigger',
          values: ['manual', 'auto'],
        },
      },
      PostCompact: {
        summary: '对话压缩后',
        description:
          '命令输入为包含压缩详细信息和摘要的 JSON。\n退出码 0 - 向用户显示 stdout\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'trigger',
          values: ['manual', 'auto'],
        },
      },
      SessionEnd: {
        summary: '会话结束时',
        description:
          '命令输入为包含会话结束原因的 JSON。\n退出码 0 - 命令成功完成\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'reason',
          values: ['clear', 'logout', 'prompt_input_exit', 'other'],
        },
      },
      PermissionRequest: {
        summary: '显示权限对话框时',
        description:
          '命令输入为包含 tool_name、tool_input 和 tool_use_id 的 JSON。\n输出包含 hookSpecificOutput 的 JSON，其中包含允许或拒绝的决定。\n退出码 0 - 使用钩子决策（如果提供）\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'tool_name',
          values: toolNames,
        },
      },
      Setup: {
        summary: '仓库初始化和维护的钩子',
        description:
          '命令输入为包含 trigger（init 或 maintenance）的 JSON。\n退出码 0 - 向 Claude 显示 stdout\n阻塞性错误将被忽略\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'trigger',
          values: ['init', 'maintenance'],
        },
      },
      TeammateIdle: {
        summary: '队友即将进入空闲状态时',
        description:
          '命令输入为包含 teammate_name 和 team_name 的 JSON。\n退出码 0 - 不显示 stdout/stderr\n退出码 2 - 向队友显示 stderr 并阻止空闲（队友继续工作）\n其他退出码 - 仅向用户显示 stderr',
      },
      TaskCreated: {
        summary: '创建任务时',
        description:
          '命令输入为包含 task_id、task_subject、task_description、teammate_name 和 team_name 的 JSON。\n退出码 0 - 不显示 stdout/stderr\n退出码 2 - 向模型显示 stderr 并阻止任务创建\n其他退出码 - 仅向用户显示 stderr',
      },
      TaskCompleted: {
        summary: '任务标记为完成时',
        description:
          '命令输入为包含 task_id、task_subject、task_description、teammate_name 和 team_name 的 JSON。\n退出码 0 - 不显示 stdout/stderr\n退出码 2 - 向模型显示 stderr 并阻止任务完成\n其他退出码 - 仅向用户显示 stderr',
      },
      Elicitation: {
        summary: 'MCP 服务器请求用户输入（征询）时',
        description:
          '命令输入为包含 mcp_server_name、message 和 requested_schema 的 JSON。\n输出包含 hookSpecificOutput 的 JSON，其中包含 action（accept/decline/cancel）和可选的 content。\n退出码 0 - 如果提供则使用钩子响应\n退出码 2 - 拒绝该征询\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'mcp_server_name',
          values: [],
        },
      },
      ElicitationResult: {
        summary: '用户响应 MCP 征询后',
        description:
          '命令输入为包含 mcp_server_name、action、content、mode 和 elicitation_id 的 JSON。\n输出包含 hookSpecificOutput 的 JSON，其中包含可选的 action 和 content 以覆盖响应。\n退出码 0 - 如果提供则使用钩子响应\n退出码 2 - 阻止该响应（action 变为 decline）\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'mcp_server_name',
          values: [],
        },
      },
      ConfigChange: {
        summary: '会话期间配置文件更改时',
        description:
          '命令输入为包含 source（user_settings、project_settings、local_settings、policy_settings、skills）和 file_path 的 JSON。\n退出码 0 - 允许更改\n退出码 2 - 阻止更改应用到会话\n其他退出码 - 仅向用户显示 stderr',
        matcherMetadata: {
          fieldToMatch: 'source',
          values: [
            'user_settings',
            'project_settings',
            'local_settings',
            'policy_settings',
            'skills',
          ],
        },
      },
      InstructionsLoaded: {
        summary: '加载指令文件（CLAUDE.md 或规则）时',
        description:
          '命令输入为包含 file_path、memory_type（User、Project、Local、Managed）、load_reason（session_start、nested_traversal、path_glob_match、include、compact）、globs（可选——匹配的路径: frontmatter 模式）、trigger_file_path（可选——Claude 触发的文件）和 parent_file_path（可选——@-包含此文件的文件）的 JSON。\n退出码 0 - 命令成功完成\n其他退出码 - 仅向用户显示 stderr\n此钩子仅用于可观测性，不支持阻止。',
        matcherMetadata: {
          fieldToMatch: 'load_reason',
          values: [
            'session_start',
            'nested_traversal',
            'path_glob_match',
            'include',
            'compact',
          ],
        },
      },
      WorktreeCreate: {
        summary: '创建隔离工作树以实现 VCS 无关的隔离',
        description:
          '命令输入为包含 name（建议的工作树名称）的 JSON。\nstdout 应包含创建的工作树目录的绝对路径。\n退出码 0 - 工作树创建成功\n其他退出码 - 工作树创建失败',
      },
      WorktreeRemove: {
        summary: '移除之前创建的工作树',
        description:
          '命令输入为包含 worktree_path（工作树的绝对路径）的 JSON。\n退出码 0 - 工作树移除成功\n其他退出码 - 仅向用户显示 stderr',
      },
      CwdChanged: {
        summary: '工作目录更改后',
        description:
          '命令输入为包含 old_cwd 和 new_cwd 的 JSON。\nCLAUDE_ENV_FILE 已设置——在那里写入 bash exports 以应用到后续的 BashTool 命令。\n钩子输出可包含 hookSpecificOutput.watchPaths（绝对路径数组）以注册到 FileChanged 监视器。\n退出码 0 - 命令成功完成\n其他退出码 - 仅向用户显示 stderr',
      },
      FileChanged: {
        summary: '监视的文件更改时',
        description:
          '命令输入为包含 file_path 和 event（change、add、unlink）的 JSON。\nCLAUDE_ENV_FILE 已设置——在那里写入 bash exports 以应用到后续的 BashTool 命令。\n匹配器字段指定要监视的当前目录中的文件名（例如 ".envrc|.env"）。\n钩子输出可包含 hookSpecificOutput.watchPaths（绝对路径数组）以动态更新监视列表。\n退出码 0 - 命令成功完成\n其他退出码 - 仅向用户显示 stderr',
      },
    }
  },
  toolNames => toolNames.slice().sort().join(','),
)

// Group hooks by event and matcher
export function groupHooksByEventAndMatcher(
  appState: AppState,
  toolNames: string[],
): Record<HookEvent, Record<string, IndividualHookConfig[]>> {
  const grouped: Record<HookEvent, Record<string, IndividualHookConfig[]>> = {
    PreToolUse: {},
    PostToolUse: {},
    PostToolUseFailure: {},
    PermissionDenied: {},
    Notification: {},
    UserPromptSubmit: {},
    SessionStart: {},
    SessionEnd: {},
    Stop: {},
    StopFailure: {},
    SubagentStart: {},
    SubagentStop: {},
    PreCompact: {},
    PostCompact: {},
    PermissionRequest: {},
    Setup: {},
    TeammateIdle: {},
    TaskCreated: {},
    TaskCompleted: {},
    Elicitation: {},
    ElicitationResult: {},
    ConfigChange: {},
    WorktreeCreate: {},
    WorktreeRemove: {},
    InstructionsLoaded: {},
    CwdChanged: {},
    FileChanged: {},
  }

  const metadata = getHookEventMetadata(toolNames)

  // Include hooks from settings files
  getAllHooks(appState).forEach(hook => {
    const eventGroup = grouped[hook.event]
    if (eventGroup) {
      // For events without matchers, use empty string as key
      const matcherKey =
        metadata[hook.event].matcherMetadata !== undefined
          ? hook.matcher || ''
          : ''
      if (!eventGroup[matcherKey]) {
        eventGroup[matcherKey] = []
      }
      eventGroup[matcherKey].push(hook)
    }
  })

  // Include registered hooks (e.g., plugin hooks)
  const registeredHooks = getRegisteredHooks()
  if (registeredHooks) {
    for (const [event, matchers] of Object.entries(registeredHooks)) {
      const hookEvent = event as HookEvent
      const eventGroup = grouped[hookEvent]
      if (!eventGroup) continue

      for (const matcher of matchers) {
        const matcherKey = matcher.matcher || ''

        // Only PluginHookMatcher has pluginRoot; HookCallbackMatcher (internal
        // callbacks like attributionHooks, sessionFileAccessHooks) does not.
        if ('pluginRoot' in matcher) {
          eventGroup[matcherKey] ??= []
          for (const hook of matcher.hooks) {
            eventGroup[matcherKey].push({
              event: hookEvent,
              config: hook,
              matcher: matcher.matcher,
              source: 'pluginHook',
              pluginName: matcher.pluginId,
            })
          }
        } else if (process.env.USER_TYPE === 'ant') {
          eventGroup[matcherKey] ??= []
          for (const _hook of matcher.hooks) {
            eventGroup[matcherKey].push({
              event: hookEvent,
              config: {
                type: 'command',
                command: '[ANT-ONLY] Built-in Hook',
              },
              matcher: matcher.matcher,
              source: 'builtinHook',
            })
          }
        }
      }
    }
  }

  return grouped
}

// Get sorted matchers for a specific event
export function getSortedMatchersForEvent(
  hooksByEventAndMatcher: Record<
    HookEvent,
    Record<string, IndividualHookConfig[]>
  >,
  event: HookEvent,
): string[] {
  const matchers = Object.keys(hooksByEventAndMatcher[event] || {})
  return sortMatchersByPriority(matchers, hooksByEventAndMatcher, event)
}

// Get hooks for a specific event and matcher
export function getHooksForMatcher(
  hooksByEventAndMatcher: Record<
    HookEvent,
    Record<string, IndividualHookConfig[]>
  >,
  event: HookEvent,
  matcher: string | null,
): IndividualHookConfig[] {
  // For events without matchers, hooks are stored with empty string as key
  // because the record keys must be strings.
  const matcherKey = matcher ?? ''
  return hooksByEventAndMatcher[event]?.[matcherKey] ?? []
}

// Get metadata for a specific event's matcher
export function getMatcherMetadata(
  event: HookEvent,
  toolNames: string[],
): MatcherMetadata | undefined {
  return getHookEventMetadata(toolNames)[event].matcherMetadata
}
