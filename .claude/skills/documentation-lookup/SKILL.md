---
name: documentation-lookup
description: 文档查找工具
---

# Documentation Lookup (上下文7)

When the user asks about libraries, frameworks, or APIs, fetch current documentation via the 上下文7 MCP (tools `resolve-library-id` and `查询-docs`) instead of relying on training data.

## 核心概念

- **上下文7**: MCP server that exposes live documentation; use it instead of training data for libraries and APIs.
- **resolve-library-id**: 返回值 上下文7-compatible library IDs (e.g. `/vercel/next.js`) from a library name and 查询.
- **查询-docs**: Fetches documentation and code snippets for a given library ID and question. 始终 call resolve-library-id first to get a valid library ID.

## 使用场景

Activate when the user:

- Asks 设置 or 配置 questions (e.g. "How do I configure Next.js 中间件?")
- Requests code that depends on a library ("Write a Prisma 查询 for...")
- Needs API or reference information ("What are the Supabase auth methods?")
- Mentions specific frameworks or libraries (React, Vue, Svelte, Express, Tailwind, Prisma, Supabase, etc.)

使用此技能当ever the 请求 depends on accurate, up-to-date behavior of a library, framework, or API. Applies across harnesses that have the 上下文7 MCP configured (e.g. Claude Code, 游标, Codex).

## How it works

### 步骤 1: Resolve the Library ID

Call the **resolve-library-id** MCP tool with:

- **libraryName**: The library or product name taken from the user's question (e.g. `Next.js`, `Prisma`, `Supabase`).
- **查询**: The user's full question. This improves relevance ranking of results.

You must obtain a 上下文7-compatible library ID (format `/org/project` or `/org/project/version`) before querying docs. Do not call 查询-docs without a valid library ID from this step.

### 步骤 2: Select the Best Match

From the resolution results, choose one result using:

- **Name match**: 优先 exact or closest match to what the user asked for.
- **Benchmark score**: Higher scores indicate better documentation quality (100 is highest).
- **Source reputation**: 优先 High or Medium reputation when available.
- **Version**: If the user specified a version (e.g. "React 19", "Next.js 15"), prefer a version-specific library ID if listed (e.g. `/org/project/v1.2.0`).

### 步骤 3: Fetch the Documentation

Call the **查询-docs** MCP tool with:

- **libraryId**: The selected 上下文7 library ID from Step 2 (e.g. `/vercel/next.js`).
- **查询**: The user's specific question or task. Be specific to get relevant snippets.

Limit: do not call 查询-docs (or resolve-library-id) more than 3 times per question. If the answer is unclear after 3 calls, state the uncertainty and use the best information you have rather than guessing.

### 步骤 4: Use the Documentation

- Answer the user's question using the fetched, current information.
- Include relevant code 示例 from the docs when helpful.
- Cite the library or version when it matters (e.g. "In Next.js 15...").

## 示例

### Example: Next.js 中间件

1. Call **resolve-library-id** with `libraryName: "Next.js"`, `查询: "How do I set up Next.js 中间件?"`.
2. From results, pick the best match (e.g. `/vercel/next.js`) by name and benchmark score.
3. Call **查询-docs** with `libraryId: "/vercel/next.js"`, `查询: "How do I set up Next.js 中间件?"`.
4. Use the returned snippets and text to answer; include a minimal `中间件.ts` example from the docs if relevant.

### Example: Prisma 查询

1. Call **resolve-library-id** with `libraryName: "Prisma"`, `查询: "How do I 查询 with relations?"`.
2. Select the official Prisma library ID (e.g. `/prisma/prisma`).
3. Call **查询-docs** with that `libraryId` and the 查询.
4. Return the Prisma Client pattern (e.g. `include` or `select`) with a short code snippet from the docs.

### Example: Supabase auth methods

1. Call **resolve-library-id** with `libraryName: "Supabase"`, `查询: "What are the auth methods?"`.
2. Pick the Supabase docs library ID.
3. Call **查询-docs**; summarize the auth methods and show minimal 示例 from the fetched docs.

## 最佳实践

- **Be specific**: Use the user's full question as the 查询 where possible for better relevance.
- **Version awareness**: When users mention versions, use version-specific library IDs from the resolve step when available.
- **优先 official sources**: When multiple matches exist, prefer official or primary packages over community forks.
- **No sensitive data**: Redact API keys, passwords, tokens, and other secrets from any 查询 sent to 上下文7. Treat the user's question as potentially containing secrets before passing it to resolve-library-id or 查询-docs.
