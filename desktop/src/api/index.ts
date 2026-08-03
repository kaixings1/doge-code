// 核心类
export { QueryEngine } from './QueryEngine.js';
export type { QueryEngineConfig, QueryOptions, QueryResult } from './QueryEngine.js';

// 工具 API
export { ToolRegistry } from './ToolRegistry.js';
export type { ITool, ToolParameters, ToolExecutionContext, ToolResult } from './ToolRegistry.js';

// 命令 API
export { CommandRegistry } from './CommandRegistry.js';
export type { ICommand, CommandContext, CommandResult } from './CommandRegistry.js';

// 配置 API
export { ConfigManager } from './ConfigManager.js';

// 会话 API
export { SessionManager } from './SessionManager.js';
export type { ISession } from './SessionManager.js';

// Hooks API
export {
  useSession,
  useQuery,
  useTool,
  useKeybinding,
  useLocalStorage,
} from './hooks.js';

// 工具函数 API
export * from './utils.js';