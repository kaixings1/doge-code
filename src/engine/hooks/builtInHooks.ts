/**
 * engine/hooks/builtInHooks.ts — 内置 Hook 处理器
 *
 * 吸收 ECC hooks 的高价值拦截模式，以轻量方式实现。
 * 这些处理器可通过 HookManager 注册到 MessageLoop 事件。
 */
import { type HookEvent, type HookResult } from './hookManager.js';

/**
 * Secret 检测：PreToolUse 时检查输入是否包含疑似密钥
 */
export function createSecretDetectionHook(): (event: HookEvent) => Promise<HookResult> {
  const secretPatterns = [
    /AIza[0-9A-Za-z\-_]{35}/,                    // Google API key
    /sk-[a-zA-Z0-9]{48,}/,                        // OpenAI-style key
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,  // PEM private key
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/, // email
    /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,     // password=xxx
  ];

  return async (event: HookEvent): Promise<HookResult> => {
    if (event.type !== 'PreToolUse' || !event.input) {
      return { allow: true };
    }

    const inputStr = JSON.stringify(event.input);
    for (const pattern of secretPatterns) {
      if (pattern.test(inputStr)) {
        return {
          allow: false,
          reason: `疑似密钥/凭证泄漏: ${pattern.source}`,
        };
      }
    }
    return { allow: true };
  };
}

/**
 * 编辑工具文件类型检查：Write/Edit 时检查目标文件类型
 */
export function createFileTypeWarningHook(): (event: HookEvent) => Promise<HookResult> {
  const docExtensions = ['.md', '.markdown', '.txt', '.rst'];

  return async (event: HookEvent): Promise<HookResult> => {
    if (event.type !== 'PreToolUse' || !event.toolName || !event.input) {
      return { allow: true };
    }

    const toolName = event.toolName.toLowerCase();
    if (!['write', 'edit', 'multiedit'].includes(toolName)) {
      return { allow: true };
    }

    const filePath = (event.input as Record<string, unknown>).file_path as string | undefined;
    if (!filePath) return { allow: true };

    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
    if (docExtensions.includes(ext)) {
      return {
        allow: true,
        updatedInput: {
          ...event.input,
          _warning: `正在编辑文档文件: ${filePath}`,
        },
      };
    }

    return { allow: true };
  };
}

/**
 * PostToolUse 日志记录：工具执行后记录摘要
 */
export function createToolAuditLogHook(): (event: HookEvent) => Promise<HookResult> {
  return async (event: HookEvent): Promise<HookResult> => {
    if (event.type !== 'PostToolUse') {
      return { allow: true };
    }

    const status = event.success === false ? `FAIL: ${event.error}` : 'OK';
    const detail = event.toolName
      ? `${event.toolName} -> ${status}`
      : status;

    // 输出到 stderr 作为审计日志（不污染 stdout）
    console.error(`[Hook:Audit] ${detail}`);

    return { allow: true };
  };
}

/**
 * SessionStart 钩子：会话开始时执行初始化
 */
export function createSessionStartHook(
  initFn: () => void | Promise<void>
): (event: HookEvent) => Promise<HookResult> {
  return async (): Promise<HookResult> => {
    try {
      await initFn();
    } catch (err) {
      console.error('[Hook:SessionStart]', err);
    }
    return { allow: true };
  };
}

/**
 * 连续失败计数：PostToolUseFailure 时累计失败次数
 */
export function createFailureTrackerHook(
  onThreshold: (count: number, toolName: string) => void,
  threshold: number = 3
): (event: HookEvent) => Promise<HookResult> {
  const failures = new Map<string, number>();

  return async (event: HookEvent): Promise<HookResult> => {
    if (event.type === 'PostToolUseFailure' && event.toolName) {
      const count = (failures.get(event.toolName) ?? 0) + 1;
      failures.set(event.toolName, count);
      if (count >= threshold) {
        onThreshold(count, event.toolName);
      }
    } else if (event.type === 'PostToolUse' && event.toolName && event.success) {
      failures.set(event.toolName, 0);
    }
    return { allow: true };
  };
}
