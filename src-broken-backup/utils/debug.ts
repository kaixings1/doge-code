import { appendFile, mkdir, symlink, unlink } from 'fs/promises';
import memoize from 'lodash-es/memoize.js';
import { dirname, join } from 'path';
import { getSessionId } from '../../bootstrap/state.js';

import { type BufferedWriter, createBufferedWriter } from './bufferedWriter.js';
import { registerCleanup } from './cleanupRegistry.js';
import {
  type DebugFilter,
  parseDebugFilter,
  shouldShowDebugMessage,
} from './debugFilter.js';
import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js';
import { getFsImplementation } from './fsOperations.js';
import { writeToStderr } from './process.js';
import { jsonStringify } from './slowOperations.js';

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<DebugLogLevel, number> = {
  verbose: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

/**
 * 包含在调试输出中的最小日志级别。默认为'debug'，过滤掉'verbose'消息。
 * 设置CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose以包含高容量诊断信息
 * （例如，完整的statusLine命令、shell、cwd、stdout/stderr），否则可能会淹没有用的调试输出。
 */
export const getMinDebugLogLevel = memoize((): DebugLogLevel => {
  const raw = process.env.CLAUDE_CODE_DEBUG_LOG_LEVEL?.toLowerCase().trim();
  if (raw && Object.hasOwn(LEVEL_ORDER, raw)) {
    return raw as DebugLogLevel;
  }
  return 'debug';
});

let runtimeDebugEnabled = false;

export const isDebugMode = memoize((): boolean => {
  return (
    runtimeDebugEnabled ||
    isEnvTruthy(process.env.DEBUG) ||
    isEnvTruthy(process.env.DEBUG_SDK) ||
    process.argv.includes('--debug') ||
    process.argv.includes('-d') ||
    isDebugToStdErr() ||
    // 同时检）-debug=pattern语法
    process.argv.some(arg => arg.startsWith('--debug=')) ||
    // --debug-file隐式启用调试模式
    getDebugFilePath() !== null
  );
});

/**
 * 在会话中途启用调试日志记录（例如通过/debug）。非ant用户默认不写入调试日志，
 * 这使它们无需通过--debug重新启动即可开始捕获。如果日志记录已激活，返回true。
 */
export function enableDebugLogging(): boolean {
  const wasActive = isDebugMode() || process.env.USER_TYPE === 'ant';
  runtimeDebugEnabled = true;
  isDebugMode.cache.clear?.();
  return wasActive;
}

// 从命令行参数中提取和解析调试过滤。
// 导出用于测试目的
export const getDebugFilter = memoize((): DebugFilter | null => {
  // 在argv中查）-debug=pattern
  const debugArg = process.argv.find(arg => arg.startsWith('--debug='));
  if (!debugArg) {
    return null;
  }

  // 提取等号后的模式
  const filterPattern = debugArg.substring('--debug='.length);
  return parseDebugFilter(filterPattern);
});

export const isDebugToStdErr = memoize((): boolean => {
  return (
    process.argv.includes('--debug-to-stderr') || process.argv.includes('-d2e')
  );
});

export const getDebugFilePath = memoize((): string | null => {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i]!;
    if (arg.startsWith('--debug-file=')) {
      return arg.substring('--debug-file='.length);
    }
    if (arg === '--debug-file' && i + 1 < process.argv.length) {
      return process.argv[i + 1]!;
    }
  }
  return null;
});

function shouldLogDebugMessage(message: string): boolean {
  if (process.env.NODE_ENV === 'test' && !isDebugToStdErr()) {
    return false;
  }

  // 非ant用户仅在调试模式激活时写入调试日志（通过启动时的--debug或会话中途的/debug。
  // Ant用户始终）share、错误报告记录日。
  if (process.env.USER_TYPE !== 'ant' && !isDebugMode()) {
    return false;
  }

  if (
    typeof process === 'undefined' ||
    typeof process.versions === 'undefined' ||
    typeof process.versions.node === 'undefined'
  ) {
    return false;
  }

  const filter = getDebugFilter();
  return shouldShowDebugMessage(message, filter);
}

let hasFormattedOutput = false;
export function setHasFormattedOutput(value: boolean): void {
  hasFormattedOutput = value;
}
export function getHasFormattedOutput(): boolean {
  return hasFormattedOutput;
}

let debugWriter: BufferedWriter | null = null;
let pendingWrite: Promise<void> = Promise.resolve();

// 模块级别，因）bind仅捕获其显式参数，而不是writeFn闭包的父作用域（Jarred）22257。
async function appendAsync(
  needMkdir: boolean,
  dir: string,
  path: string,
  content: string,
): Promise<void> {
  if (needMkdir) {
    await mkdir(dir, { recursive: true }).catch(() => {});
  }
  await appendFile(path, content);
  void updateLatestDebugLogSymlink();
}

function noop(): void {}

function getDebugWriter(): BufferedWriter {
  if (!debugWriter) {
    let ensuredDir: string | null = null;
    debugWriter = createBufferedWriter({
      writeFn: content => {
        const path = getDebugLogPath();
        const dir = dirname(path);
        const needMkdir = ensuredDir !== dir;
        ensuredDir = dir;
        if (isDebugMode()) {
          // immediateMode：必须保持同步。直接process.exit()时异步写入会丢失。
          // 并在beforeExit处理程序中保持事件循环活动（与Perfetto跟踪的无限循环）。参）22257
          if (needMkdir) {
            try {
              getFsImplementation().mkdirSync(dir);
            } catch {
              // 目录已存。
            }
          }
          getFsImplementation().appendFileSync(path, content);
          void updateLatestDebugLogSymlink();
          return;
        }
        // 缓冲路径（ant用户没有--debug）：每秒刷新，使链深度保持在~1
        // 对闭包使）bind，因此仅保留绑定参数，而不是此作用。
        pendingWrite = pendingWrite
          .then(appendAsync.bind(null, needMkdir, dir, path, content))
          .catch(noop);
      },
      flushIntervalMs: 1000,
      maxBufferSize: 100,
      immediateMode: isDebugMode(),
    });
    registerCleanup(async () => {
      debugWriter?.dispose();
      await pendingWrite;
    });
  }
  return debugWriter;
}

export async function flushDebugLogs(): Promise<void> {
  debugWriter?.flush();
  await pendingWrite;
}

export function logForDebugging(
  message: string,
  { level }: { level: DebugLogLevel } = {
    level: 'debug',
  },
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinDebugLogLevel()]) {
    return;
  }
  if (!shouldLogDebugMessage(message)) {
    return;
  }

  // 多行消息破坏jsonl输出格式，因此将任何多行消息转换为JSON
  if (hasFormattedOutput && message.includes('\n')) {
    message = jsonStringify(message);
  }
  const timestamp = new Date().toISOString();
  const output = `${timestamp} [${level.toUpperCase()}] ${message.trim()}\n`;
  if (isDebugToStdErr()) {
    writeToStderr(output);
    return;
  }

  getDebugWriter().write(output);
}

export function getDebugLogPath(): string {
  return (
    getDebugFilePath() ??
    process.env.CLAUDE_CODE_DEBUG_LOGS_DIR ??
    join(getClaudeConfigHomeDir(), 'debug', `${getSessionId()}.txt`)
  );
}

/**
 * 更新最新的调试日志符号链接以指向当前调试日志文件。
 * 在~/.claude/debug/latest创建或更新符号链。
 */
const updateLatestDebugLogSymlink = memoize(async (): Promise<void> => {
  try {
    const debugLogPath = getDebugLogPath();
    const debugLogsDir = dirname(debugLogPath);
    const latestSymlinkPath = join(debugLogsDir, 'latest');

    await unlink(latestSymlinkPath).catch(() => {});
    await symlink(debugLogPath, latestSymlinkPath);
  } catch {
    // 如果符号链接创建失败，静默失。
  }
});

/**
 * 仅记录Ant用户的错误，生产环境中始终可。
 */
export function logAntError(context: string, error: unknown): void {
  if (process.env.USER_TYPE !== 'ant') {
    return;
  }

  if (error instanceof Error && error.stack) {
    logForDebugging(`[仅限ANT] ${context} 堆栈跟踪：\n${error.stack}`, {
      level: 'error',
    });
  }
}