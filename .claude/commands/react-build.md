---
description: 增量修复 React 构建失败（Vite、webpack、Next.js、CRA、Parcel、esbuild、Bun）—— JSX/TSX 编译错误、水合不匹配、服务端/客户端组件边界失败、类型缺失。调用 react-build-resolver 代理进行最小化、外科手术式的修复。
---

# React 构建与修复

此命令调用 **react-build-resolver** 代理，以最小改动增量修复 React 构建错误。

## 此命令做什么

1. **检测构建系统**：识别 Vite、webpack、Next.js、CRA、Parcel、esbuild 或 Bun
2. **运行构建**：执行项目的构建脚本
3. **解析错误**：按层分组（TypeScript / 打包器配置 / 运行时 / 水合）
4. **增量修复**：一次一个错误，每次改动后重新运行构建
5. **报告摘要**：显示已修复和剩余的问题

## 何时使用

在以下情况使用 `/react-build`：

- `npm run build`（或 pnpm/yarn/bun 等价命令）失败
- TypeScript 或 React 升级后出现 JSX/TSX 编译错误
- 运行时出现 Next.js 水合不匹配错误
- App Router 中的服务端/客户端组件边界错误
- 安装或升级 `react`、`react-dom`、`@types/react` 或某个打包器之后
- 涉及 React 的类型缺失或 "module not found" 错误

## 范围

此命令负责 **React 构建/打包器/运行时水合** 失败。对于与 React 无关的纯 TypeScript 类型错误，请改用 `/build-fix`（通用）。

## 运行的诊断命令

```bash
# Project build script (preferred)
npm run build --if-present
pnpm build 2>/dev/null
yarn build 2>/dev/null
bun run build 2>/dev/null

# Standalone typecheck
npm run typecheck --if-present
tsc --noEmit -p tsconfig.json

# Bundler-specific fallback
next build                          # Next.js
vite build                          # Vite
react-scripts build                 # CRA
webpack --mode=production           # webpack
parcel build src/index.html         # Parcel
bun build ./src/index.tsx --outdir=dist
```

## 会话示例

````text
User: /react-build

Agent:
# React Build Resolution

## Build System Detected
Vite (vite.config.ts present, @vitejs/plugin-react in deps)

## Initial Diagnostics

```bash
$ npm run build
> tsc -b && vite build

src/components/UserCard.tsx:1:8 - error TS6133: 'React' is declared but its value is never read.
src/components/Modal.tsx:12:15 - error TS7016: Could not find a declaration file for module 'react-portal'.
src/pages/Home.tsx:42:5 - error: 'useState' is not defined
```

Errors found: 3

## Fix 1: Old JSX transform leftover

File: src/components/UserCard.tsx:1
Cause: `tsconfig.json` already uses `"jsx": "react-jsx"`; the explicit `import React` is unused.

```tsx
// Removed
- import React from 'react';
```

```bash
$ npm run build
# 2 errors remaining
```

## Fix 2: Missing types

File: src/components/Modal.tsx
Cause: `@types/react-portal` not installed.

```bash
$ npm i -D @types/react-portal
added 1 package
```

```bash
$ npm run build
# 1 error remaining
```

## Fix 3: Missing hook import

File: src/pages/Home.tsx
Cause: `useState` referenced but not imported.

```tsx
- import { useEffect } from "react";
+ import { useEffect, useState } from "react";
```

```bash
$ npm run build
# Build successful!
```

## Final Verification

```bash
$ npm run build
✓ built in 2.34s

$ npm test
✓ 47 tests passed
```

## Summary

| Metric | Count |
|--------|-------|
| Build errors fixed | 3 |
| Files modified | 2 |
| Dependencies added | 1 (@types/react-portal) |
| Remaining issues | 0 |

Build Status: PASS: SUCCESS
````

## 常见错误及修复

| Error | Typical Fix |
|---|---|
| `'React' is not defined` | 在 tsconfig 中设置 `"jsx": "react-jsx"`（React 17+） |
| 缺少 `@types/react` | `npm i -D @types/react @types/react-dom` |
| `Unexpected token '<'` | 添加 `@vitejs/plugin-react` / `babel-loader` |
| `You're importing a component that needs useState`（Next.js） | 添加 `"use client"`，或把 hook 移到客户端组件子节点中 |
| `Module not found: Can't resolve 'fs'`（Next.js） | 移除 `fs` 导入，或把逻辑移到服务端组件 / API 路由中 |
| `Hydration failed because the initial UI does not match` | 把 `Date.now()`/`Math.random()`/`window.*` 移到 `useEffect` 中 |
| `Invalid hook call` | 存在多份 React 副本 —— 通过 `resolutions`/`overrides` 去重 |
| `Element type is invalid` | 默认导入与具名导入不匹配 |

## 修复策略

1. **编译错误优先** —— 代码必须先能构建
2. **水合错误其次** —— 影响生产正确性
3. **打包器配置第三** —— 恢复插件/加载器的正确性
4. **一次一个修复** —— 验证每次改动
5. **最小改动** —— 绝不在无解释的情况下使用 `// @ts-ignore`
6. **每次修复后重跑** —— 立即暴露新错误

## 停止条件

代理将在以下情况停止并报告：

- 同一错误在 3 次尝试后仍然存在
- 修复引入的错误多于它解决的
- 需要的架构性改动超出构建修复范畴（例如重新设计 RSC 边界）
- 打包器版本不再支持已安装的 React 主版本

## 相关命令

- `/react-test` — 构建通过后运行测试
- `/react-review` — 构建成功后审查代码质量
- `/build-fix` — 通用构建修复器（非 React）
- `verification-loop` 技能 — 完整验证循环

## 相关

- Agent：`agents/react-build-resolver.md`
- Skills：`skills/react-patterns/`, `skills/frontend-patterns/`
- Rules：`rules/react/coding-style.md`, `rules/react/patterns.md`
