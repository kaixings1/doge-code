/**
 * engine/hooks/hookManager.ts — Hook 管理器（吸收 ECC hooks 模式）
 *
 * ECC hooks 的核心模式：事件驱动的拦截器。
 * 本系统将事件类型与可注册的处理器绑定，支持异步/同步执行。
 *
 * 对齐 MessageLoop 的 AgentEvent，提供注册 API 给外部模块。
 */

/**
 * Hook 事件类型（对齐 ECC hooks.json 事件 + MessageLoop AgentEvent）
 */
export type HookEventType =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'SubagentStart'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'InstructionsLoaded'
  | 'TaskCompleted'
  | 'ConfigChange';

/**
 * Hook 处理器返回结果
 */
export interface HookResult {
  /** 是否允许继续执行（false = 阻止） */
  allow: boolean;
  /** 可选：修改后的输入 */
  updatedInput?: Record<string, unknown>;
  /** 可选：阻止原因 */
  reason?: string;
}

/**
 * Hook 处理器函数签名
 */
export type HookHandler = (event: HookEvent) => HookResult | Promise<HookResult>;

/**
 * Hook 事件负载（对齐 ECC hooks 的 matcher 输入）
 */
export interface HookEvent {
  type: HookEventType;
  /** 工具名（PreToolUse/PostToolUse 等） */
  toolName?: string;
  /** 工具输入 */
  input?: Record<string, unknown>;
  /** 工具输出 */
  output?: string;
  /** 是否成功 */
  success?: boolean;
  /** 错误信息 */
  error?: string;
  /** 用户消息（UserPromptSubmit） */
  userMessage?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 原始事件数据 */
  raw?: Record<string, unknown>;
  /** 工具调用 ID */
  toolUseId?: string;
}

/**
 * Hook 注册项
 */
interface HookRegistration {
  handler: HookHandler;
  /** 匹配的事件类型 */
  eventType: HookEventType;
  /** 匹配的工具名（逗号分隔，'*' 表示全部） */
  toolNameMatcher?: string;
  /** 是否异步执行（不阻塞主流程） */
  async?: boolean;
  /** 超时（毫秒） */
  timeoutMs?: number;
}

/**
 * Hook 管理器：注册/注销/触发事件钩子
 *
 * 吸收 ECC hooks.json 的 matcher-hook 模式：
 * - matcher: 工具名过滤（Bash|Write|Edit）
 * - hooks: 处理器列表
 */
export class HookManager {
  private hooks: HookRegistration[] = [];

  /**
   * 注册 hook 处理器
   */
  register(opts: {
    eventType: HookEventType;
    handler: HookHandler;
    toolNameMatcher?: string;
    async?: boolean;
    timeoutMs?: number;
  }): () => void {
    const reg: HookRegistration = {
      eventType: opts.eventType,
      handler: opts.handler,
      toolNameMatcher: opts.toolNameMatcher ?? '*',
      async: opts.async ?? false,
      timeoutMs: opts.timeoutMs ?? 5000,
    };
    this.hooks.push(reg);
    // 返回注销函数
    return () => {
      const idx = this.hooks.indexOf(reg);
      if (idx >= 0) this.hooks.splice(idx, 1);
    };
  }

  /**
   * 注销所有匹配的 hooks
   */
  unregister(eventType: HookEventType, handler?: HookHandler): void {
    this.hooks = this.hooks.filter(h => {
      if (h.eventType !== eventType) return true;
      if (handler && h.handler !== handler) return true;
      return false;
    });
  }

  /**
   * 触发事件钩子
   * @returns 如果有阻止的 hook，返回第一个阻止结果；否则返回 { allow: true }
   */
  async trigger(event: HookEvent): Promise<HookResult> {
    const matched = this.hooks.filter(h => {
      if (h.eventType !== event.type) return false;
      if (h.toolNameMatcher === '*') return true;
      if (!event.toolName) return false;
      const patterns = h.toolNameMatcher!.split('|').map(s => s.trim());
      return patterns.includes(event.toolName);
    });

    let lastResult: HookResult = { allow: true };
    for (const hook of matched) {
      try {
        const result = hook.async
          ? await this._withTimeout(Promise.resolve(hook.handler(event)), hook.timeoutMs!)
          : await hook.handler(event);

        if (result && result.allow === false) {
          return result; // 阻止执行
        }
        lastResult = result;
      } catch (err) {
        // Hook 执行错误不影响主流程
        console.error(`[HookManager] Hook error (${hook.eventType}):`, err);
      }
    }
    return lastResult;
  }

  /**
   * 清空所有 hooks
   */
  clear(): void {
    this.hooks = [];
  }

  /**
   * 获取已注册 hooks 数量
   */
  size(): number {
    return this.hooks.length;
  }

  private async _withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Hook timeout after ${ms}ms`)), ms)
      ),
    ]);
  }
}

/** 全局 Hook 管理器单例（Session 级） */
let globalInstance: HookManager | null = null;

export function getHookManager(): HookManager {
  if (!globalInstance) {
    globalInstance = new HookManager();
  }
  return globalInstance;
}

export function resetHookManager(): void {
  globalInstance = null;
}
