// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import { toolMatchesName, type Tool, type Tools } from './Tool.js'
import { feature } from 'bun:bundle'
import { loadConditionalCommand } from './commands/loader.js'
import { AgentTool } from './tools/AgentTool/AgentTool.js'
import { AgentIntegrationTool } from './tools/AgentIntegrationTool/AgentIntegrationTool.js'
import { SkillTool } from './tools/SkillTool/SkillTool.js'
import { BashTool } from './tools/BashTool/BashTool.js'
import { FileEditTool } from './tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from './tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from './tools/GlobTool/GlobTool.js'
import { NotebookEditTool } from './tools/NotebookEditTool/NotebookEditTool.js'
import { WebFetchTool } from './tools/WebFetchTool/WebFetchTool.js'
import { TaskStopTool } from './tools/TaskStopTool/TaskStopTool.js'
import { BriefTool } from './tools/BriefTool/BriefTool.js'
// 死代码消除：仅限 ant 的工具条件导入
/* eslint-disable custom-rules/no-process-env-top-level */
const REPLTool = loadConditionalCommand(
  () => process.env.USER_TYPE === 'ant',
  () => require('./tools/REPLTool/REPLTool.js').REPLTool
)
const SuggestBackgroundPRTool = loadConditionalCommand(
  () => process.env.USER_TYPE === 'ant',
  () => require('./tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js').SuggestBackgroundPRTool
)
const SleepTool = loadConditionalCommand(
  [() => feature('PROACTIVE'), () => feature('KAIROS')],
  () => require('./tools/SleepTool/SleepTool.js').SleepTool
)
const cronTools = loadConditionalCommand(
  () => feature('AGENT_TRIGGERS'),
  () => [
      require('./tools/ScheduleCronTool/CronCreateTool.js').CronCreateTool,
      require('./tools/ScheduleCronTool/CronDeleteTool.js').CronDeleteTool,
      require('./tools/ScheduleCronTool/CronListTool.js').CronListTool,
    ]
) ?? []
const RemoteTriggerTool = loadConditionalCommand(
  () => feature('AGENT_TRIGGERS_REMOTE'),
  () => require('./tools/RemoteTriggerTool/RemoteTriggerTool.js').RemoteTriggerTool
)
const SendUserFileTool = loadConditionalCommand(
  () => feature('KAIROS'),
  () => require('./tools/SendUserFileTool/SendUserFileTool.js').SendUserFileTool
)
const PushNotificationTool = loadConditionalCommand(
  [() => feature('KAIROS'), () => feature('KAIROS_PUSH_NOTIFICATION')],
  () => require('./tools/PushNotificationTool/PushNotificationTool.js').PushNotificationTool
)
const SubscribePRTool = loadConditionalCommand(
  () => feature('KAIROS_GITHUB_WEBHOOKS'),
  () => require('./tools/SubscribePRTool/SubscribePRTool.js').SubscribePRTool
)
/* eslint-enable custom-rules/no-process-env-top-level */
import { TaskOutputTool } from './tools/TaskOutputTool/TaskOutputTool.js'
import { WebSearchTool } from './tools/WebSearchTool/WebSearchTool.js'
import { MultiSearchTool } from './tools/MultiSearchTool/MultiSearchTool.js'
import { UltrareviewTool } from './tools/UltrareviewTool/UltrareviewTool.js'
import { LessPermissionPromptsTool } from './tools/LessPermissionPromptsTool/LessPermissionPromptsTool.js'
import { EffortTool } from './tools/EffortTool/EffortTool.js'
import { ThemeTool } from './tools/ThemeTool/ThemeTool.js'
import { TodoWriteTool } from './tools/TodoWriteTool/TodoWriteTool.js'
import { AdvisorTool } from './tools/AdvisorTool/AdvisorTool.js'
import { ActionSamplerTool } from './tools/ActionSamplerTool/ActionSamplerTool.js'
import { ToolCollectionTool } from './tools/ToolCollectionTool/ToolCollectionTool.js'
import { SandboxTool } from './tools/SandboxTool/SandboxTool.js'
import { ProjectScaffolderTool } from './tools/ProjectScaffolderTool/ProjectScaffolderTool.js'
import { PythonInterpreterTool } from './tools/PythonInterpreterTool/PythonInterpreterTool.js'
import { FlowTool } from './tools/FlowTool/FlowTool.js'
import { StateMachineTool } from './tools/StateMachineTool/StateMachineTool.js'
import { AgentDevelopmentTool } from './tools/AgentDevelopmentTool/AgentDevelopmentTool.js'
import { LLMRouterTool } from './tools/LLMRouterTool/LLMRouterTool.js'
import { VimVisualModeTool } from './tools/VimVisualModeTool/VimVisualModeTool.js'
import { TerminalPanelTool } from './tools/TerminalPanelTool/TerminalPanelTool.js'
import { ContextCollapseTool } from './tools/ContextCollapseTool/ContextCollapseTool.js'
import { TaskCreateTool } from './tools/TaskCreateTool/TaskCreateTool.js'
import { PlanModeTool } from './tools/PlanModeTool/PlanModeTool.js'
import { BranchTool } from './tools/BranchTool/BranchTool.js'
import { GitTool } from './tools/GitTool/GitTool.js'
import { CompareTool } from './tools/CompareTool/CompareTool.js'
import { SearchReplaceEditTool } from './tools/SearchReplaceEditTool/SearchReplaceEditTool.js'
import { GraphqlTool } from './tools/GraphqlTool/GraphqlTool.js'
import { HttpTool } from './tools/HttpTool/HttpTool.js'
import { DatabaseTool } from './tools/DatabaseTool/DatabaseTool.js'
import { ShellTool } from './tools/ShellTool/ShellTool.js'
import { FileWatcherTool } from './tools/FileWatcherTool/FileWatcherTool.js'
import { ScheduleTool } from './tools/ScheduleTool/ScheduleTool.js'
import { CronTool } from './tools/CronTool/CronTool.js'
import { WebSocketTool } from './tools/WebSocketTool/WebSocketTool.js'
import { EventStreamTool } from './tools/EventStreamTool/EventStreamTool.js'
import { QueueTool } from './tools/QueueTool/QueueTool.js'
import { CacheTool } from './tools/CacheTool/CacheTool.js'
import { LoggerTool } from './tools/LoggerTool/LoggerTool.js'
import { MetricsTool } from './tools/MetricsTool/MetricsTool.js'
import { MonitorTool } from './tools/MonitorTool/MonitorTool.js'
import { BackupTool } from './tools/BackupTool/BackupTool.js'
import { McpToolSearchTool } from './tools/McpToolSearchTool/McpToolSearchTool.js'
import { ExitPlanModeV2Tool } from './tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { TestingPermissionTool } from './tools/testing/TestingPermissionTool.js'
import { GrepTool } from './tools/GrepTool/GrepTool.js'
import { TungstenTool } from './tools/TungstenTool/TungstenTool.js'
// 懒加载 require 以打破循环依赖：tools.ts -> TeamCreateTool/TeamDeleteTool -> ... -> tools.ts
 
const getTeamCreateTool = () =>
  require('./tools/TeamCreateTool/TeamCreateTool.js')
    .TeamCreateTool as typeof import('./tools/TeamCreateTool/TeamCreateTool.js').TeamCreateTool
const getTeamDeleteTool = () =>
  require('./tools/TeamDeleteTool/TeamDeleteTool.js')
    .TeamDeleteTool as typeof import('./tools/TeamDeleteTool/TeamDeleteTool.js').TeamDeleteTool
const getSendMessageTool = () =>
  require('./tools/SendMessageTool/SendMessageTool.js')
    .SendMessageTool as typeof import('./tools/SendMessageTool/SendMessageTool.js').SendMessageTool
/* eslint-enable @typescript-eslint/no-require-imports */
import { AskUserQuestionTool } from './tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { MultiFileEditTool } from './tools/MultiFileEditTool/MultiFileEditTool.js'
import { LSPTool } from './tools/LSPTool/LSPTool.js'
import { ListMcpResourcesTool } from './tools/ListMcpResourcesTool/ListMcpResourcesTool.js'
import { ReadMcpResourceTool } from './tools/ReadMcpResourceTool/ReadMcpResourceTool.js'
import { ToolSearchTool } from './tools/ToolSearchTool/ToolSearchTool.js'
import { EnterPlanModeTool } from './tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { EnterWorktreeTool } from './tools/EnterWorktreeTool/EnterWorktreeTool.js'
import { ExitWorktreeTool } from './tools/ExitWorktreeTool/ExitWorktreeTool.js'
import { ConfigTool } from './tools/ConfigTool/ConfigTool.js'
import { TaskGetTool } from './tools/TaskGetTool/TaskGetTool.js'
import { TaskUpdateTool } from './tools/TaskUpdateTool/TaskUpdateTool.js'
import { TaskListTool } from './tools/TaskListTool/TaskListTool.js'
import { uniqBy } from './vendor/lodash.js'
import { isToolSearchEnabledOptimistic } from './utils/toolSearch.js'
import { isTodoV2Enabled } from './utils/tasks.js'
// 死代码消除：CLAUDE_CODE_VERIFY_PLAN 的条件导入
/* eslint-disable custom-rules/no-process-env-top-level */
const VerifyPlanExecutionTool =
  process.env.CLAUDE_CODE_VERIFY_PLAN === 'true'
    ? require('./tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js')
        .VerifyPlanExecutionTool
    : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import { SYNTHETIC_OUTPUT_TOOL_NAME } from './tools/SyntheticOutputTool/SyntheticOutputTool.js'
export {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
} from './constants/tools.js'
import { feature } from 'bun:bundle'
// 死代码消除：OVERFLOW_TEST_TOOL 的条件导入
/* eslint-disable custom-rules/no-process-env-top-level */
const OverflowTestTool = feature('OVERFLOW_TEST_TOOL')
  ? require('./tools/OverflowTestTool/OverflowTestTool.js').OverflowTestTool
  : null
const CtxInspectTool = feature('CONTEXT_COLLAPSE')
  ? require('./tools/CtxInspectTool/CtxInspectTool.js').CtxInspectTool
  : null
const TerminalCaptureTool = feature('TERMINAL_PANEL')
  ? require('./tools/TerminalCaptureTool/TerminalCaptureTool.js')
      .TerminalCaptureTool
  : null
const WebBrowserTool = feature('WEB_BROWSER_TOOL')
  ? require('./tools/WebBrowserTool/WebBrowserTool.js').WebBrowserTool
  : null
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('./coordinator/coordinatorMode.js') as typeof import('./coordinator/coordinatorMode.js'))
  : null
const SnipTool = feature('HISTORY_SNIP')
  ? require('./tools/SnipTool/SnipTool.js').SnipTool
  : null
const ListPeersTool = feature('UDS_INBOX')
  ? require('./tools/ListPeersTool/ListPeersTool.js').ListPeersTool
  : null
const AgentProxyTool = require('./tools/AgentProxyTool/index.js').AgentProxyTool
const WorkflowTool = feature('WORKFLOW_SCRIPTS')
  ? (() => {
      require('./tools/WorkflowTool/bundled/index.js').initBundledWorkflows()
      return require('./tools/WorkflowTool/WorkflowTool.js').WorkflowTool
    })()
  : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import type { ToolPermissionContext } from './Tool.js'
import { getDenyRuleForTool } from './utils/permissions/permissions.js'
import { hasEmbeddedSearchTools } from './utils/embeddedTools.js'
import { isEnvTruthy } from './utils/envUtils.js'
import { isPowerShellToolEnabled } from './utils/shell/shellToolUtils.js'
import { isAgentSwarmsEnabled } from './utils/agentSwarmsEnabled.js'
import { isWorktreeModeEnabled } from './utils/worktreeModeEnabled.js'
import {
  REPL_TOOL_NAME,
  REPL_ONLY_TOOLS,
  isReplModeEnabled,
} from './tools/REPLTool/constants.js'
export { REPL_ONLY_TOOLS }
/* eslint-disable @typescript-eslint/no-require-imports */
const getPowerShellTool = () => {
  if (!isPowerShellToolEnabled()) return null
  return (
    require('./tools/PowerShellTool/PowerShellTool.js') as typeof import('./tools/PowerShellTool/PowerShellTool.js')
  ).PowerShellTool
}
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * 可与 --tools 标志一起使用的预定义工具预设
 */
export const TOOL_PRESETS = ['default'] as const

export type ToolPreset = (typeof TOOL_PRESETS)[number]

export function parseToolPreset(preset: string): ToolPreset | null {
  const presetString = preset.toLowerCase()
  if (!TOOL_PRESETS.includes(presetString as ToolPreset)) {
    return null
  }
  return presetString as ToolPreset
}

/**
 * 获取给定预设的工具名称列表
 * 过滤掉通过 isEnabled() 检查被禁用的工具
 * @param preset 预设名称
 * @returns 工具名称数组
 */
export function getToolsForDefaultPreset(): string[] {
  const tools = getAllBaseTools()
  const isEnabled = tools.map(tool => tool.isEnabled())
  return tools.filter((_, i) => isEnabled[i]).map(tool => tool.name)
}

/**
 * 获取当前环境中可能可用的所有工具的完整详尽列表
 * （尊重 process.env 标志）。
 * 这是所有工具的单一事实来源。
 */
/**
 * 注意：此列表必须与 https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_code_global_system_caching 保持同步，以便跨用户缓存系统提示。
 */
import { _setInToolInitCallStackForTesting } from './services/analytics/growthbook.js'

// Tool initialization depth guard — prevents infinite recursion when
// getAllBaseTools() is called during config/GrowthBook initialization.
let _toolInitDepth = 0

export function getToolInitDepth(): number {
  return _toolInitDepth
}
/**
 * Mark the start of a tool-initialization call stack.
 * Used internally by growthbook.ts to detect recursion.
 */
export function _markToolInitStart(): void {
  _toolInitDepth++
  _setInToolInitCallStackForTesting(_toolInitDepth >= 1)
}
/**
 * Mark the end of a tool-initialization call stack.
 */
export function _markToolInitEnd(): void {
  _toolInitDepth--
  if (_toolInitDepth <= 0) {
    _toolInitDepth = 0
    _setInToolInitCallStackForTesting(false)
  }
}

export function getAllBaseTools(): Tools {
  _markToolInitStart()
	
  const _tools: Tool[] = [];
  try {
    _tools.push(AgentTool);
    _tools.push(AgentIntegrationTool);
    _tools.push(TaskOutputTool);
    _tools.push(BashTool);
    _tools.push(GlobTool, GrepTool);
    _tools.push(ExitPlanModeV2Tool);
    _tools.push(FileReadTool);
    _tools.push(FileEditTool);
    _tools.push(FileWriteTool);
    _tools.push(NotebookEditTool);
    _tools.push(WebFetchTool);
    _tools.push(TodoWriteTool);
    _tools.push(WebSearchTool);
    _tools.push(MultiSearchTool);
    _tools.push(TaskStopTool);
    _tools.push(AskUserQuestionTool);
    _tools.push(SkillTool);
    _tools.push(EnterPlanModeTool);
    if (process.env.USER_TYPE === 'ant') {
      _tools.push(ConfigTool);
    }
    if (process.env.USER_TYPE === 'ant') {
      _tools.push(TungstenTool);
    }

    if (isTodoV2Enabled()) {
      _tools.push(TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool);
    }
    if (OverflowTestTool) { _tools.push(OverflowTestTool); }
    if (CtxInspectTool) { _tools.push(CtxInspectTool); }
    if (TerminalCaptureTool) { _tools.push(TerminalCaptureTool); }
    if (isEnvTruthy(process.env.ENABLE_LSP_TOOL)) { _tools.push(LSPTool); }
    if (isWorktreeModeEnabled()) { _tools.push(EnterWorktreeTool, ExitWorktreeTool); }
    _tools.push(getSendMessageTool());
    if (ListPeersTool) { _tools.push(ListPeersTool); }
    if (AgentProxyTool) { _tools.push(new AgentProxyTool()); }
    if (isAgentSwarmsEnabled()) {
      _tools.push(getTeamCreateTool(), getTeamDeleteTool());
    }
    if (VerifyPlanExecutionTool) { _tools.push(VerifyPlanExecutionTool); }
    if (process.env.USER_TYPE === 'ant' && REPLTool) {
      _tools.push(REPLTool);
    }
    if (WorkflowTool) { _tools.push(WorkflowTool); }
    if (SleepTool) { _tools.push(SleepTool); }
    if (cronTools.length > 0) { _tools.push(...cronTools); }
    if (RemoteTriggerTool) { _tools.push(RemoteTriggerTool); }
		if (MonitorTool) { _tools.push(MonitorTool); }
 
    _tools.push(BriefTool);
    if (SendUserFileTool) { _tools.push(SendUserFileTool); }
    if (PushNotificationTool) { _tools.push(PushNotificationTool); }
    if (SubscribePRTool) { _tools.push(SubscribePRTool); }
    if (getPowerShellTool()) { _tools.push(getPowerShellTool() as Tool); }
    if (SnipTool) { _tools.push(SnipTool); }
    if (process.env.NODE_ENV === 'test') {
      _tools.push(TestingPermissionTool);
    }
    _tools.push(ListMcpResourcesTool);
    _tools.push(ReadMcpResourceTool);
    if (isToolSearchEnabledOptimistic()) { _tools.push(ToolSearchTool); }
    _tools.push(UltrareviewTool);
    _tools.push(LessPermissionPromptsTool);
    _tools.push(EffortTool);
    _tools.push(ThemeTool);
    _tools.push(AdvisorTool);
    _tools.push(VimVisualModeTool);
    _tools.push(TerminalPanelTool);
    _tools.push(ContextCollapseTool);
    _tools.push(PlanModeTool);
    _tools.push(BranchTool);
    _tools.push(GitTool);
    _tools.push(ActionSamplerTool);
    _tools.push(ToolCollectionTool);
    _tools.push(SandboxTool);
    _tools.push(ProjectScaffolderTool);
    _tools.push(PythonInterpreterTool);
    _tools.push(FlowTool);
    _tools.push(StateMachineTool);
    _tools.push(AgentDevelopmentTool);
    _tools.push(LLMRouterTool);
    _tools.push(CompareTool);
    _tools.push(SearchReplaceEditTool);
    _tools.push(GraphqlTool);
    _tools.push(HttpTool);
    _tools.push(DatabaseTool);
    _tools.push(ShellTool);
    _tools.push(FileWatcherTool);
    _tools.push(ScheduleTool);
    _tools.push(CronTool);
    _tools.push(WebSocketTool);
    _tools.push(EventStreamTool);
    _tools.push(QueueTool);
    _tools.push(CacheTool);
    _tools.push(LoggerTool);
    _tools.push(MetricsTool); 
    _tools.push(BackupTool);
    _tools.push(McpToolSearchTool);
    _tools.push(MultiFileEditTool);
    if (SuggestBackgroundPRTool) { _tools.push(SuggestBackgroundPRTool); } 
    if (WebBrowserTool) { _tools.push(WebBrowserTool); } 
  } finally {
    _markToolInitEnd()
  }
	if(isEnvTruthy(process.env.CLAUDE_CODE_CONSOLE_DEBUG) ||isEnvTruthy(process.env.DEBUG) )
	{
		for (let i = 0; i < _tools.length; i++) {
			const t = _tools[i];
			if (t === null) {
				console.error(`❌ _tools[${i}] is null`);
			} else if (t === undefined) {
				console.error(`❌ _tools[${i}] is undefined`);
			} else if (typeof t !== 'object') {
				console.error(`❌ _tools[${i}] is primitive:`, typeof t, t);
			} else if (typeof t.prompt !== 'function') {
				console.error(`❌ MISSING prompt():`, t.name || '(no name)', 'at index', i);
			}
			//else
				//console.error(`${i}prompt():`,t, t.name );
		}
	}
 
	return _tools.filter(Boolean) as Tools;
}

/**
 * 过滤掉权限上下文统一拒绝的工具。
 * 如果存在匹配工具名称且没有 ruleContent 的拒绝规则（即对该工具的全面拒绝），则工具将被过滤掉。
 *
 * 使用与运行时权限检查相同的匹配器（步骤 1a），因此像 `mcp__server` 这样的服务器前缀规则
 * 会在模型看到之前剥离来自该服务器的所有工具——而不仅仅是在调用时。
 */
export function filterToolsByDenyRules<
  T extends {
    name: string
    mcpInfo?: { serverName: string; toolName: string }
  },
>(tools: readonly T[], permissionContext: ToolPermissionContext): T[] {
  return tools.filter(tool => !getDenyRuleForTool(permissionContext, tool))
}

export const getTools = (permissionContext: ToolPermissionContext): Tools => {
  // 简单模式：仅 Bash、Read 和 Edit 工具
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    // --bare + REPL 模式：REPL 在 VM 内部包装 Bash/Read/Edit 等，因此
    // 返回 REPL 而非原始原语。与下面的非 bare 路径匹配，后者在 REPL 启用时也会隐藏 REPL_ONLY_TOOLS。
    if (isReplModeEnabled() && REPLTool) {
      const replSimple: Tool[] = [REPLTool]
      if (
        feature('COORDINATOR_MODE') &&
        coordinatorModeModule?.isCoordinatorMode()
      ) {
        replSimple.push(TaskStopTool, getSendMessageTool())
      }
      return filterToolsByDenyRules(replSimple, permissionContext)
    }
    const simpleTools: Tool[] =  [BashTool, FileReadTool, FileEditTool,
 /*AgentTool,
 TaskOutputTool,
 BashTool,
 GlobTool, GrepTool,
 ExitPlanModeV2Tool,
 FileReadTool,
 FileEditTool,
 FileWriteTool,
 NotebookEditTool,
 WebFetchTool,
 TodoWriteTool,
 WebSearchTool,
 MultiSearchTool,
 TaskStopTool,
 AskUserQuestionTool,
 SkillTool,
  EnterPlanModeTool,

   ConfigTool,

   /*TungstenTool,*/
    
   //SuggestBackgroundPRTool, 
//WebBrowserTool, 
/*
   TaskCreateTool,
	 TaskGetTool, TaskUpdateTool, TaskListTool,

//OverflowTestTool, 
//CtxInspectTool, 
//TerminalCaptureTool, 
   LSPTool, 
EnterWorktreeTool, ExitWorktreeTool, 
  getSendMessageTool(),
 //ListPeersTool, 
  // getTeamCreateTool(), getTeamDeleteTool(),
 //VerifyPlanExecutionTool, 
   //REPLTool,
 //WorkflowTool, 
 SleepTool, 
 //...cronTools, 
 //RemoteTriggerTool, 
 //MonitorTool,
 BriefTool,
 //SendUserFileTool, 
 // PushNotificationTool, 
 //SubscribePRTool, 
 //getPowerShellTool() as Tool, 
// SnipTool, 
/*
TestingPermissionTool,
ListMcpResourcesTool,
ReadMcpResourceTool,
ToolSearchTool, 
UltrareviewTool,
LessPermissionPromptsTool,
EffortTool,
ThemeTool,
AdvisorTool,
VimVisualModeTool,
TerminalPanelTool,
ContextCollapseTool,
//WorkflowTool,
//SnipTool, 
PlanModeTool,
BranchTool,
GitTool,
CompareTool,
GraphqlTool,
HttpTool,
DatabaseTool,
ShellTool,
FileWatcherTool,
ScheduleTool,
CronTool,
WebSocketTool,
EventStreamTool,
QueueTool,
CacheTool,
LoggerTool,
MetricsTool,
MonitorTool,
BackupTool,
McpToolSearchTool,
MultiFileEditTool*/

 ]
		
		
		
    // 当协调者模式也激活时，包含 AgentTool 和 TaskStopTool，
    // 以便协调者获得 Task+TaskStop（通过 useMergedTools 过滤），并且
    // 工作节点获得 Bash/Read/Edit（通过 filterToolsForAgent 过滤）。
    if (
      feature('COORDINATOR_MODE') &&
      coordinatorModeModule?.isCoordinatorMode()
    ) {
      simpleTools.push(AgentTool, TaskStopTool, getSendMessageTool())
    }
    return filterToolsByDenyRules(simpleTools, permissionContext)
  }

  // 获取所有基础工具并过滤掉有条件添加的特殊工具
  const specialTools = new Set([
    ListMcpResourcesTool.name,
    ReadMcpResourceTool.name,
    SYNTHETIC_OUTPUT_TOOL_NAME,
  ])

  const tools = getAllBaseTools() //.filter(tool => !specialTools.has(tool.name))

  // 过滤掉被拒绝规则拒绝的工具
  let allowedTools = filterToolsByDenyRules(tools, permissionContext)

  // 当 REPL 模式启用时，隐藏原始工具使其不被直接使用。
  // 它们仍然可以通过 VM 上下文在 REPL 内部访问。
  if (isReplModeEnabled()) {
    const replEnabled = allowedTools.some(tool =>
      toolMatchesName(tool, REPL_TOOL_NAME),
    )
    if (replEnabled) {
      allowedTools = allowedTools.filter(
        tool => !REPL_ONLY_TOOLS.has(tool.name),
      )
    }
  }

  const isEnabled = allowedTools.map(_ => _.isEnabled())
  return allowedTools.filter((_, i) => isEnabled[i])
}

/**
 * 为给定的权限上下文和 MCP 工具组装完整的工具池。
 *
 * 这是将内置工具与 MCP 工具合并的单一事实来源。
 * REPL.tsx（通过 useMergedTools 钩子）和 runAgent.ts（用于协调者工作节点）
 * 都使用此函数以确保工具池组装的一致性。
 *
 * 该函数：
 * 1. 通过 getTools() 获取内置工具（尊重模式过滤）
 * 2. 根据拒绝规则过滤 MCP 工具
 * 3. 按工具名称去重（内置工具优先）
 *
 * @param permissionContext - 用于过滤内置工具的权限上下文
 * @param mcpTools - 来自 appState.mcp.tools 的 MCP 工具
 * @returns 内置工具和 MCP 工具的合并、去重数组
 */
export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)

  // 过滤掉拒绝列表中的 MCP 工具
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext)

  // 对每个分区进行排序以稳定 prompt 缓存，将内置工具作为连续的前缀。
  // 服务端的 claude_code_system_cache_policy 在最后一个前缀匹配的内置工具之后放置一个全局缓存断点；
  // 平面排序会将 MCP 工具交错插入内置工具中，并且每当一个 MCP 工具排序到现有内置工具之间时，会使所有下游缓存键失效。
  // uniqBy 保留插入顺序，因此内置工具在名称冲突时胜出。
  // 避免使用 Array.toSorted（Node 20+）——我们支持 Node 18。builtInTools 是只读的，因此复制后排序；allowedMcpTools 是新鲜的 .filter() 结果。
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name)
  return uniqBy(
    [...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)),
    'name',
  )
}

/**
 * 获取所有工具，包括内置工具和 MCP 工具。
 *
 * 当你需要完整的工具列表用于以下场景时，这是首选函数：
 * - 工具搜索阈值计算（isToolSearchEnabled）
 * - 包含 MCP 工具的 token 计数
 * - 任何应考虑 MCP 工具的上下文
 *
 * 仅当你明确只需要内置工具时才使用 getTools()。
 *
 * @param permissionContext - 用于过滤内置工具的权限上下文
 * @param mcpTools - 来自 appState.mcp.tools 的 MCP 工具
 * @returns 内置工具和 MCP 工具的组合数组
 */
export function getMergedTools(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)
  return [...builtInTools, ...mcpTools]
}// FORCE_RECOMPILE_2026_07_23_2300  
