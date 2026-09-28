// 此文件已拆分为 src/types/tool.ts（803 行合入 378 行）。
// 以下 re-export 保持向后兼容——所有引用方无需修改。

export {
  type Tool,
  type ToolInfo,
  type AnyObject,
  type Tools,
  type ToolDef,
  type ToolDefaults,
  type ToolInputJSONSchema,
  type ToolUseBlockParam,
  type ToolResultBlockParam,
  type QueryChainTracking,
  type ValidationResult,
  type ToolResult,
  type SetToolJSXFn,
  type ToolPermissionContext,
  type CompactProgressEvent,
  type ToolUseContext,
  type ToolCallProgress,
  buildTool,
  toolMatchesName,
  findToolByName,
  getEmptyToolPermissionContext,
} from './types/tool.js'

export {
  type AgentToolProgress,
  type BashProgress,
  type MCPProgress,
  type REPLToolProgress,
  type SkillToolProgress,
  type TaskOutputProgress,
  type WebSearchProgress,
  type HookProgress,
  type ToolProgressData,
  type Progress,
  type ToolProgress,
  filterToolProgressMessages,
} from './types/toolProgress.js'

export { type ToolPermissionRulesBySource } from './types/toolPermission.js'
