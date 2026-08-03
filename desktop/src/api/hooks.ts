import type { InternalMessage, QueryState } from './types.js';
import type { QueryEngine, QueryResult } from './QueryEngine.js';
import type { ToolRegistry, ToolResult } from './ToolRegistry.js';
import type { ISession } from './SessionManager.js';

/**
 * 使用会话 Hook
 *
 * @param sessionId - 会话 ID（可选）
 * @returns 会话管理对象
 * @example
 * ```typescript
 * const { session, messages, addMessage } = useSession();
 * ```
 */
export function useSession(sessionId?: string): {
  session: ISession | null;
  messages: InternalMessage[];
  addMessage: (message: InternalMessage) => void;
  clearMessages: () => void;
  createSession: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  saveSession: () => Promise<void>;
} {
  throw new Error('Not implemented');
}

/**
 * 使用查询 Hook
 *
 * @param queryEngine - 查询引擎实例
 * @returns 查询管理对象
 * @example
 * ```typescript
 * const { query, state, result, abort } = useQuery(engine);
 * ```
 */
export function useQuery(queryEngine: QueryEngine): {
  query: (message: string) => Promise<QueryResult>;
  state: QueryState;
  result: QueryResult | null;
  error: Error | null;
  abort: () => void;
} {
  throw new Error('Not implemented');
}

/**
 * 使用工具 Hook
 *
 * @param toolRegistry - 工具注册表实例
 * @returns 工具管理对象
 * @example
 * ```typescript
 * const { execute, loading, result } = useTool(registry);
 * ```
 */
export function useTool(toolRegistry: ToolRegistry): {
  execute: (name: string, params: any) => Promise<ToolResult>;
  loading: boolean;
  result: ToolResult | null;
  error: Error | null;
} {
  throw new Error('Not implemented');
}

/**
 * 使用快捷键 Hook
 *
 * @param key - 按键
 * @param callback - 回调函数
 * @param options - 选项
 * @example
 * ```typescript
 * useKeybinding('c', () => console.log('Ctrl+C'), { ctrl: true });
 * ```
 */
export function useKeybinding(
  key: string,
  callback: () => void,
  options?: { ctrl?: boolean; alt?: boolean; shift?: boolean }
): void {
  throw new Error('Not implemented');
}

/**
 * 使用本地存储 Hook
 *
 * @param key - 存储键
 * @param initialValue - 初始值
 * @returns 存储值和设置函数
 * @example
 * ```typescript
 * const [theme, setTheme] = useLocalStorage('theme', 'dark');
 * ```
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  throw new Error('Not implemented');
}