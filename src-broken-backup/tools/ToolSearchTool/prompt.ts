import { feature } from 'bun:bundle'
import { isReplBridgeActive } from '../../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import type { Tool } from '../../../Tool.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'

// 无用代码消除：仅）KAIROS ）KAIROS_BRIEF 启用时需要简短工具名
/* eslint-disable @typescript-eslint/no-require-imports */
const BRIEF_TOOL_NAME: string | null =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? (
        require('../BriefTool/prompt.js') as typeof import('../BriefTool/prompt.js')
      ).BRIEF_TOOL_NAME
    : null
const SEND_USER_FILE_TOOL_NAME: string | null = feature('KAIROS')
  ? (
      require('../SendUserFileTool/prompt.js') as typeof import('../SendUserFileTool/prompt.js')
    ).SEND_USER_FILE_TOOL_NAME
  : null

/* eslint-enable @typescript-eslint/no-require-imports */

export { TOOL_SEARCH_TOOL_NAME } from './constants.js'

import { TOOL_SEARCH_TOOL_NAME } from './constants.js'

const PROMPT_HEAD = `获取延迟工具的完整模式定义以便调用？

`

// ）toolSearch.ts 中的 isDeferredToolsDeltaEnabled 匹配（未导入。
// toolSearch.ts 从本文件导入）。启用时：工具通过 system-reminder 附件宣告。
// 禁用时：前置 <available-deferred-tools> 块（门控前的行为）。
function getToolLocationHint(): string {
  const deltaEnabled =
    process.env.USER_TYPE === 'ant' ||
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_glacier_2xr', false)
  return deltaEnabled
    ? '延迟工具将按名称出现）<system-reminder> 消息中。
    : '延迟工具将按名称出现）<available-deferred-tools> 消息中。
}

const PROMPT_TAIL = ` 在获取之前只知道名称 —）没有参数模式，因此无法调用该工具。此工具接受查询，与延迟工具列表匹配，并）functions 块内返回匹配工具的完）JSONSchema 定义。一旦工具的模式出现在结果中，它就可以像提示顶部的任何工具一样调用。

结果格式：每个匹配的工具）function 行出现在 functions 块内 —）与此提示顶部的工具列表相同的编码。

查询形式。
- "select:Read,Edit,Grep" —）按名称精确获取这些工。
- "notebook jupyter" —）关键字搜索最）max_results 个最佳匹。
- "+slack send" —）要求名称中包）slack，按剩余术语排序`

/**
 * 判断某个工具是否应被延迟（需）ToolSearch 加载）。
 * 满足以下条件之一的工具将被延迟：
 * - ）MCP 工具（始终延）- 工作流特定）
 * - 拥有 shouldDefer: true
 *
 * 如果工具设置）alwaysLoad: true，则绝不会被延迟（MCP 工具通过 _meta['anthropic/alwaysLoad'] 设置时。
 * 此检查优先于所有其他规则。
 */
export function isDeferredTool(tool: Tool): boolean {
  // 显式选择退出：通过 _meta['anthropic/alwaysLoad']，工具以完整模式出现在初始提示中。
  // 优先检查，以便 MCP 工具可以选择退出。
  if (tool.alwaysLoad === true) return false

  // MCP 工具始终延迟（工作流特定。
  if (tool.isMcp === true) return true

  // 永不延迟 ToolSearch 自身 —）模型需要它来加载其他所有工。
  if (tool.name === TOOL_SEARCH_TOOL_NAME) return false

  // 分支优先实验：Agent 必须在第一轮就可用，不能通过 ToolSearch 加载。
  // 延迟 require：静态导）forkSubagent 会在模块初始化时通过 constants/tools.ts 产生循环依赖。
  if (feature('FORK_SUBAGENT') && tool.name === AGENT_TOOL_NAME) {
    type ForkMod = typeof import('../AgentTool/forkSubagent.js')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('../AgentTool/forkSubagent.js') as ForkMod
    if (m.isForkSubagentEnabled()) return false
  }

  // Brief 是主要通信通道（当该工具存在时）。
  // 其提示包含文本可见性约定，模型必须在不经过 ToolSearch 往返的情况下看到它。
  // 此处不需要运行时门控：该工具）isEnabled() 就是 isBriefEnabled()，因此询问其延迟状态意味着门控已经通过。
  if (
    (feature('KAIROS') || feature('KAIROS_BRIEF')) &&
    BRIEF_TOOL_NAME &&
    tool.name === BRIEF_TOOL_NAME
  ) {
    return false
  }

  // SendUserFile 是文件传送通信通道（与 Brief 并列）。
  // 必须立即可用，无需 ToolSearch 往返。
  if (
    feature('KAIROS') &&
    SEND_USER_FILE_TOOL_NAME &&
    tool.name === SEND_USER_FILE_TOOL_NAME &&
    isReplBridgeActive()
  ) {
    return false
  }

  return tool.shouldDefer === true
}

/**
 * ）<available-deferred-tools> 用户消息格式化一行延迟工具。
 * 搜索提示（tool.searchHint）不会渲）—）提示 A/B 测试（exp_xenhnnmn0smrx4，已）3 ）21 日停止）显示没有益处。
 */
export function formatDeferredToolLine(tool: Tool): string {
  return tool.name
}

export function getPrompt(): string {
  return PROMPT_HEAD + getToolLocationHint() + PROMPT_TAIL
}