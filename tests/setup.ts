/**
 * Vitest 全局 setup。
 *
 * 1. 删除宿主进程（Claude Code）注入的 CLAUDE_CODE_FEATURE_* 环境变量，
 *    使 bun:bundle polyfill 的 feature() 全部返回 false（与 CLI 默认行为一致）。
 *    原因：config.ts 等模块会用 feature('TEAMMEM') 等条件 require 只在
 *    bun 运行时（可解析 .js → .ts）下可用的模块；测试继承宿主 env 会触发
 *    这些 require，而 vitest 的 Node 解析无法完成 .js → .ts 解析。
 *
 * 2. patch Node require 解析，模拟 bun 的 .js → .ts 隐式解析
 *    （源码中 461 处 require('./xxx.js') 依赖此行为）。
 */
for (const key of Object.keys(process.env)) {
  if (key.startsWith('CLAUDE_CODE_FEATURE_')) {
    delete process.env[key];
  }
}

// Ensure config guard (config.ts:1415) recognizes test environment
process.env.NODE_ENV = 'test'

// Prevent envDynamic.ts from crashing in test environment
// (terminal detection reads process.env which may not have TERMINAL_EMULATOR)
try {
  process.env.TERMINAL_EMULATOR = ''
} catch { /* env vars may be read-only in some environments */ }

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { register } from 'node:module';
import * as path from 'node:path';

// 注册 ESM resolve hook，让 Node ESM（type stripping）加载的 .ts 模块
// 内部 `.js` 后缀 import 也能回退到 `.ts`（模拟 bun 的隐式解析）。
register('./esm-resolver.mjs', import.meta.url);

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire('module') as {
  _resolveFilename: (request: string, ...args: unknown[]) => string;
};

const originalResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (
  request: string,
  parent: any,
  ...args: unknown[]
) {
  try {
    return originalResolve(request, parent, ...args);
  } catch (err) {
    // bun 的隐式解析行为：.js 后缀或无扩展名回退到 .ts / .tsx。
    // 相对路径基于父模块所在目录（而非 cwd）解析。
    if (request.startsWith('.')) {
      const parentDir = parent?.filename
        ? path.dirname(parent.filename)
        : process.cwd();
      const abs = path.resolve(parentDir, request);
      if (request.endsWith('.js')) {
        const tsPath = abs.replace(/\.js$/, '.ts');
        if (existsSync(tsPath)) {
          return originalResolve(tsPath, parent, ...args);
        }
      } else if (path.extname(request) === '') {
        const tsPath = `${abs}.ts`;
        if (existsSync(tsPath)) {
          return originalResolve(tsPath, parent, ...args);
        }
        const tsxPath = `${abs}.tsx`;
        if (existsSync(tsxPath)) {
          return originalResolve(tsxPath, parent, ...args);
        }
      }
    }
    throw err;
  }
};

