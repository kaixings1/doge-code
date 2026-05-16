// biome-ignore-all assist/source/organizeImports：仅限 ANT 的导入标记不得重新排序
import { feature } from 'bun:bundle'
import { TASK_OUTPUT_TOOL_NAME } from '../tools/TaskOutputTool/constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../tools/ExitPlanModeTool/constants.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../tools/EnterPlanModeTool/constants.js'
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../tools/AskUserQuestionTool/prompt.js'
import { TASK_STOP_TOOL_NAME } from '../tools/TaskStopTool/prompt.js'
import { FILE_READ_TOOL_NAME } from '../tools/FileReadTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from '../tools/WebSearchTool/prompt.js'
import { TODO_WRITE_TOOL_NAME } from '../tools/TodoWriteTool/constants.js'
import { GREP_TOOL_NAME } from '../tools/GrepTool/prompt.js'
import { WEB_FETCH_TOOL_NAME } from '../tools/WebFetchTool/prompt.js'
import { GLOB_TOOL_NAME } from '../tools/GlobTool/prompt.js'
import { SHELL_TOOL_NAMES } from '../utils/shell/shellToolUtils.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from '../tools/NotebookEditTool/constants.js'
import { SKILL_TOOL_NAME } from '../tools/SkillTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '../tools/SendMessageTool/constants.js'
import { TASK_CREATE_TOOL_NAME } from '../tools/TaskCreateTool/constants.js'
import { TASK_GET_TOOL_NAME } from '../tools/TaskGetTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '../tools/TaskListTool/constants.js'
import { TASK_UPDATE_TOOL_NAME } from '../tools/TaskUpdateTool/constants.js'
import { TOOL_SEARCH_TOOL_NAME } from '../tools/ToolSearchTool/prompt.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '../tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { ENTER_WORKTREE_TOOL_NAME } from '../tools/EnterWorktreeTool/constants.js'
import { EXIT_WORKTREE_TOOL_NAME } from '../tools/ExitWorktreeTool/constants.js'
import { WORKFLOW_TOOL_NAME } from '../tools/WorkflowTool/constants.js'
import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
} from '../tools/ScheduleCronTool/prompt.js'

export const ALL_AGENT_DISALLOWED_TOOLS = new Set([
  TASK_OUTPUT_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  // 当用户为 ant 时，允许代理使用 Agent 工具（启用嵌套代理）
  ...(process.env.USER_TYPE === 'ant' ? [] : [AGENT_TOOL_NAME]),
  ASK_USER_QUESTION_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  // 防止子代理中递归执行工作流。
  ...(feature('WORKFLOW_SCRIPTS') ? [WORKFLOW_TOOL_NAME] : []),
])

export const CUSTOM_AGENT_DISALLOWED_TOOLS = new Set([
  ...ALL_AGENT_DISALLOWED_TOOLS,
])

/*
 * 异步代理工具可用性状态（真实数据来源）
 */
export const ASYNC_AGENT_ALLOWED_TOOLS = new Set([
  FILE_READ_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  GREP_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  GLOB_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
  SKILL_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
  TOOL_SEARCH_TOOL_NAME,
  ENTER_WORKTREE_TOOL_NAME,
  EXIT_WORKTREE_TOOL_NAME,
])
/**
 * 仅允许进程内队友使用的工具（非通用异步代理）。
 * 这些工具由 inProcessRunner.ts 注入，并通过 isInProcessTeammate()
 * 检查在 filterToolsForAgent 中放行。
 */
export const IN_PROCESS_TEAMMATE_ALLOWED_TOOLS = new Set([
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  // 队友创建的定时任务使用创建者的 agentId 标记，并路由到
  // 该队友的 pendingUserMessages 队列（参见 useScheduledTasks.ts）。
  ...(feature('AGENT_TRIGGERS')
    ? [CRON_CREATE_TOOL_NAME, CRON_DELETE_TOOL_NAME, CRON_LIST_TOOL_NAME]
    : []),
])

/*
 * 异步代理被阻止的工具：
 * - AgentTool：阻止以防止递归
 * - TaskOutputTool：阻止以防止递归
 * - ExitPlanModeTool：计划模式是主线程抽象。
 * - TaskStopTool：需要访问主线程任务状态。
 * - TungstenTool：使用在代理之间冲突的单例虚拟终端抽象。
 *
 * 稍后启用（需要工作）：
 * - MCPTool：待定
 * - ListMcpResourcesTool：待定
 * - ReadMcpResourceTool：待定
 */

/**
 * 协调器模式下允许的工具——仅限协调器的输出和代理管理工具
 */
export const COORDINATOR_MODE_ALLOWED_TOOLS = new Set([
  AGENT_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])
