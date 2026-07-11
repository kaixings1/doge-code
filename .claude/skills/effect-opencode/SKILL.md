---
name: Effect Opencode 相关功能和最佳实践。使用 Effect
description: "Effect Opencode — Effect Opencode 相关功能和最佳实践。使用 Effect 进行类型化、可组合的 TypeScript 服务、模式和工作流。"
---

# Effect

此代码库使用 Effect 进行类型化、可组合的 TypeScript 服务、模式和工作流。

## 真相来源

使用当前的 Effect v4 / effect-smol 源代码，而非内存或旧的 Effect v2/v3 示例。

1. 如果缺少 `.opencode/references/effect-smol`，克隆 `https://github.com/Effect-TS/effect-smol` 到此位置。请在项目中执行此操作，而非在技能文件夹中。
2. 在回答或实现 Effect 特定代码之前，先在 `.opencode/references/effect-smol` 中搜索确切的 API、示例、测试和命名模式。
3. Also inspect existing repo code for local house style before introducing new patterns.
4. 优先 answers and implementations backed by specific source files or nearby repo 示例.

## 指南

- 优先 current Effect v4 APIs and project-local patterns over old blog posts, 示例, or package-memory guesses.
- Use `Effect.gen(function* () { ... })` for multi-step workflows.
- Use `Effect.fn("Name")` or `Effect.fnUntraced(...)` for named effects when adding reusable service methods or important workflows.
- 优先 Effect `架构` for API and domain data shapes. Use branded schemas for IDs and `架构.TaggedErrorClass` for typed domain errors when modeling new error surfaces.
- Keep HTTP handlers thin: decode input, read 请求 context, call services, and map transport errors. Put business rules in services.
- In Effect service code, prefer Effect-aware platform abstractions and dependencies over ad hoc promises where the surrounding code already does so.
- Keep layer composition explicit. Avoid broad hidden provisioning that makes missing dependencies hard to see.
- In tests, prefer the repo's existing Effect test helpers and live tests for filesystem, git, child process, locks, or timing behavior.
- Do not introduce `any`, non-null assertions, unchecked casts, or older Effect APIs just to satisfy types.
- Do not answer from memory. Verify against `.opencode/references/effect-smol` or nearby code first.

## Testing Patterns

- Use `testEffect(...)` from `packages/opencode/test/lib/effect.ts` for tests that exercise Effect services, layers, runtime context, scoped resources, or platform integrations.
- Use `it.live(...)` for filesystem, git repositories, HTTP servers, sockets, child processes, locks, real time, and other live platform behavior.
- Run tests from package directories such as `packages/opencode`; never run package tests from the repo root.
- 优先 explicit test layers over ad hoc managed runtimes. Keep dependency provisioning visible in the test file.
- Use scoped fixtures and finalizers for resources that must be cleaned up, including temporary directories, flags, databases, fibers, servers, and global state.
