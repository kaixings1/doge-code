import type { TelemetryEvent } from './types.js';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

/**
 * 带重试的异步操作
 * @param fn 要执行的操作
 * @param retries 重试次数（默认 3）
 * @param delayMs 重试间隔（默认 500ms，指数退避）
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries) {
        // 指数退避：500ms, 1s, 2s...
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

/**
 * 并发控制：限制同时执行的最大任务数
 * @param tasks 任务列表
 * @param concurrency 最大并发数
 */
export async function mapWithConcurrency<T, R>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  transform: (result: T, index: number) => R
): Promise<R[]> {
  const results: R[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= tasks.length) break;
      try {
        const result = await tasks[index]();
        results[index] = transform(result, index);
      } catch (err) {
        results[index] = transform(err as any, index);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 防抖：限制高频调用
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delayMs: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * 节流：限制调用频率
 */
export function throttle<T extends (...args: any[]) => any>(fn: T, limitMs: number): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limitMs) {
      lastCall = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
        timer = null;
      }, limitMs - (now - lastCall));
    }
  };
}

/**
 * 带超时的 Promise
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message || `Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function readFile(path: string): Promise<string> {
  return readFileSync(path, 'utf-8');
}

export async function writeFile(path: string, content: string): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf('\\'));
  if (dir) { try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ } }
  writeFileSync(path, content, 'utf-8');
}

export async function fileExists(path: string): Promise<boolean> {
  return existsSync(path);
}

export async function readJson<T>(path: string): Promise<T> {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as T;
}

export async function writeJson(path: string, data: any): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf('\\'));
  if (dir) { try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ } }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export async function gitExec(args: string[]): Promise<string> {
  const result = execSync(`git ${args.join(' ')}`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return result.trim();
}

export function getModelProvider(model: string): 'anthropic' | 'openai' | 'custom' {
  const m = model.toLowerCase();
  if (m.includes('claude') || m.includes('anthropic')) return 'anthropic';
  if (m.includes('gpt') || m.includes('deepseek') || m.includes('qwen')) return 'openai';
  return 'custom';
}

export function calculateModelCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { in: number; out: number }> = {
    'claude-opus-4-6': { in: 15, out: 75 },
    'claude-sonnet-4-6': { in: 3, out: 15 },
    'claude-haiku-4-5': { in: 0.8, out: 4 },
    'gpt-4o': { in: 2.5, out: 10 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
  };
  const p = pricing[model] || { in: 3, out: 15 };
  return (inputTokens * p.in + outputTokens * p.out) / 1000000;
}

export function checkPermission(tool: string, action: string): boolean {
  const allowedTools = ['FileReadTool', 'GlobTool', 'GrepTool', 'WebFetchTool', 'WebSearchTool'];
  const dangerousActions = ['rm -rf', 'sudo', 'chmod 777', 'git push --force'];
  if (dangerousActions.some(a => action.includes(a))) return false;
  if (allowedTools.includes(tool)) return true;
  return true; // default allow, permission system will handle restrictions
}

export function createTelemetryEvent(name: string, properties?: Record<string, any>): TelemetryEvent {
  return { name, properties: properties || {}, timestamp: new Date() };
}

export function serialize(data: any): string {
  return JSON.stringify(data);
}

export function deserialize(data: string): any {
  return JSON.parse(data);
}

export function getConfig(key: string, defaultValue?: any): any {
  try {
    const configPath = process.env.CLAUDE_CONFIG_DIR
      ? process.env.CLAUDE_CONFIG_DIR + '/.claude.json'
      : require('os').homedir() + '/.doge/.claude.json';
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const parts = key.split('.');
    let current = config;
    for (const part of parts) {
      if (current === undefined || current === null) return defaultValue;
      current = current[part];
    }
    return current !== undefined ? current : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setConfig(key: string, value: any): void {
  try {
    const configPath = process.env.CLAUDE_CONFIG_DIR
      ? process.env.CLAUDE_CONFIG_DIR + '/.claude.json'
      : require('os').homedir() + '/.doge/.claude.json';
    let config: any = {};
    try { config = JSON.parse(readFileSync(configPath, 'utf-8')); } catch { /* ignore */ }
    const parts = key.split('.');
    let current = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    const dir = configPath.substring(0, configPath.lastIndexOf('\\'));
    if (dir) { try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ } }
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch { /* ignore */ }
}