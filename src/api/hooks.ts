import type { InternalMessage, QueryState } from './types.js';
import type { QueryEngine } from './QueryEngine.js';
import type { ToolRegistry, ToolResult } from './ToolRegistry.js';
import type { ISession } from './SessionManager.js';
import { SessionManager } from './SessionManager.js';

// 尝试加载 React（如果可用）
// React 类型声明为宽松对象，允许泛型调用
let React: {
  useState: <T>(initial: T | (() => T)) => [T, (value: T) => void];
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  useRef: <T>(initial: T) => { current: T };
} | null = null;
try {
  React = require('react') as typeof React;
} catch { /* 非 React 环境 */ }

let sessionManagerInstance: SessionManager | null = null;

function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}

/**
 * 会话管理 Hook
 * 在 React 环境中提供响应式状态；否则提供普通函数
 */
export function useSession(sessionId?: string): {
  session: ISession | null;
  messages: InternalMessage[];
  addMessage: (message: InternalMessage) => void;
  clearMessages: () => void;
  createSession: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  saveSession: () => Promise<void>;
  loading: boolean;
} {
  const mgr = getSessionManager();

  // React 响应式版本
  if (React?.useState) {
    const [session, setSession] = React.useState<ISession | null>(sessionId ? null : mgr.getActiveSession());
    const [messages, setMessages] = React.useState<InternalMessage[]>(sessionId ? [] : (mgr.getActiveSession()?.messages || []));
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
      if (sessionId) {
        setLoading(true);
        mgr.loadSession(sessionId).then(s => {
          setSession(s);
          setMessages(s?.messages || []);
          setLoading(false);
        }).catch(() => setLoading(false));
      }
    }, [sessionId]);

    return {
      session,
      messages,
      addMessage: (message: InternalMessage) => {
        const target = session || mgr.getActiveSession();
        if (target) {
          mgr.addMessage(target.id, message).then(() => {
            setMessages([...messages, message]);
          });
        }
      },
      clearMessages: () => {
        const target = session || mgr.getActiveSession();
        if (target) {
          mgr.clearMessages(target.id).then(() => setMessages([]));
        }
      },
      createSession: async () => {
        const s = await mgr.createSession();
        setSession(s);
        setMessages([]);
      },
      loadSession: async (id: string) => {
        const s = await mgr.loadSession(id);
        setSession(s);
        setMessages(s?.messages || []);
      },
      saveSession: async () => {
        if (session) await mgr.saveSession(session);
      },
      loading,
    };
  }

  // 非 React 回退版本
  let currentSession: ISession | null = sessionId ? null : mgr.getActiveSession();
  if (sessionId) {
    mgr.loadSession(sessionId).then(s => { currentSession = s; });
  }
  return {
    session: currentSession,
    messages: currentSession?.messages || [],
    addMessage: (message: InternalMessage) => {
      if (currentSession) mgr.addMessage(currentSession.id, message);
    },
    clearMessages: () => {
      if (currentSession) mgr.clearMessages(currentSession.id);
    },
    createSession: async () => { currentSession = await mgr.createSession(); },
    loadSession: async (id: string) => { currentSession = await mgr.loadSession(id); },
    saveSession: async () => { if (currentSession) await mgr.saveSession(currentSession); },
    loading: false,
  };
}

/**
 * 查询 Hook
 * 在 React 环境中提供响应式状态；否则提供普通函数
 */
export function useQuery(queryEngine: QueryEngine): {
  query: (message: string) => Promise<any>;
  state: QueryState;
  result: any | null;
  error: Error | null;
  abort: () => void;
  loading: boolean;
} {
  if (React?.useState) {
    const [state, setState] = React.useState<QueryState>('idle');
    const [result, setResult] = React.useState<any | null>(null);
    const [error, setError] = React.useState<Error | null>(null);
    const [loading, setLoading] = React.useState(false);
    const abortRef = React.useRef<() => void>(() => {});

    return {
      query: async (message: string) => {
        setLoading(true);
        setState('responding');
        setError(null);
        try {
          const res = await queryEngine.query(message);
          setResult(res);
          setState('done');
          setLoading(false);
          return res;
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setState('crashed');
          setLoading(false);
          throw err;
        }
      },
      state,
      result,
      error,
      abort: () => {
        queryEngine.abort();
        setState('aborted_by_user');
        setLoading(false);
      },
      loading,
    };
  }

  let currentState: QueryState = 'idle';
  let currentResult: any | null = null;
  let currentError: Error | null = null;
  return {
    query: async (message: string) => {
      currentState = 'responding';
      currentError = null;
      try {
        const result = await queryEngine.query(message);
        currentResult = result;
        currentState = 'done';
        return result;
      } catch (err) {
        currentError = err instanceof Error ? err : new Error(String(err));
        currentState = 'crashed';
        throw err;
      }
    },
    get state() { return currentState; },
    get result() { return currentResult; },
    get error() { return currentError; },
    abort: () => { currentState = 'aborted_by_user'; queryEngine.abort(); },
    get loading() { return currentState === 'responding'; },
  };
}

/**
 * 工具调用 Hook
 * 在 React 环境中提供响应式状态；否则提供普通函数
 */
export function useTool(toolRegistry: ToolRegistry): {
  execute: (name: string, params: any) => Promise<ToolResult>;
  loading: boolean;
  result: ToolResult | null;
  error: Error | null;
} {
  if (React?.useState) {
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState<ToolResult | null>(null);
    const [error, setError] = React.useState<Error | null>(null);

    return {
      execute: async (name: string, params: any) => {
        setLoading(true);
        setError(null);
        try {
          const res = await toolRegistry.execute(name, params, { sessionId: '', messageId: '', permissions: [] });
          setResult(res);
          setLoading(false);
          return res;
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
          throw err;
        }
      },
      loading,
      result,
      error,
    };
  }

  let isLoading = false;
  let lastResult: ToolResult | null = null;
  let lastError: Error | null = null;
  return {
    execute: async (name: string, params: any) => {
      isLoading = true;
      lastError = null;
      try {
        const result = await toolRegistry.execute(name, params, { sessionId: '', messageId: '', permissions: [] });
        lastResult = result;
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        throw err;
      } finally {
        isLoading = false;
      }
    },
    get loading() { return isLoading; },
    get result() { return lastResult; },
    get error() { return lastError; },
  };
}

/**
 * 快捷键 Hook（支持 React 响应式清理）
 */
export function useKeybinding(
  key: string,
  callback: () => void,
  options?: { ctrl?: boolean; alt?: boolean; shift?: boolean }
): void {
  if (typeof window === 'undefined') return;

  const handler = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === key.toLowerCase() &&
        (!options?.ctrl || e.ctrlKey) &&
        (!options?.alt || e.altKey) &&
        (!options?.shift || e.shiftKey)) {
      e.preventDefault();
      callback();
    }
  };

  // React 版本：useEffect 自动清理
  if (React?.useEffect) {
    React.useEffect(() => {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [key, options?.ctrl, options?.alt, options?.shift]);
    return;
  }

  window.addEventListener('keydown', handler);
}

/**
 * 本地存储 Hook（React 响应式 + 跨标签页同步）
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  // React 版本
  if (React?.useState && React?.useEffect) {
    const [storedValue, setStoredValue] = React.useState<T>(() => {
      try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
      } catch { return initialValue; }
    });

    React.useEffect(() => {
      const handler = (e: StorageEvent) => {
        if (e.key === key && e.newValue) {
          try { setStoredValue(JSON.parse(e.newValue)); } catch { /* ignore */ }
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    }, [key]);

    const setValue = (value: T) => {
      setStoredValue(value);
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    };

    return [storedValue, setValue];
  }

  // 非 React 版本
  let storedValue: T = initialValue;
  try {
    const item = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    storedValue = item ? JSON.parse(item) : initialValue;
  } catch { storedValue = initialValue; }

  const setValue = (value: T) => {
    storedValue = value;
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
  };

  return [storedValue, setValue];
}