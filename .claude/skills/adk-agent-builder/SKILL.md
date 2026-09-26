---
name: adk-agent-builder
description: ADK 代理构建器 — 构建、测试和迭代 ADK 代理的中心枢纽。在用户想要创建新代理、配置模式（task/single-turn）或构建基于图的 workflow 时使用。
---

# ADK 代理构建器

本文件是一份目录，收录了用 ADK 开发代理时所需的各类专题
参考指南。为避免上下文污染，请只阅读与当前任务相关的
参考文件。

## 核心概念目录

以下文件提供基础知识：

- **入门与基础代理**：[getting-started.md](references/getting-started.md)
  - 环境搭建、API Key 配置，以及最小可用的代理定义。
- **工具目录**：[tool-catalog.md](references/tool-catalog.md)
  - 如何绑定函数工具、MCP 工具、OpenAPI 规范，以及 Google API 工具。
- **代理模式（Task / Single-Turn）**：[task-mode.md](references/task-mode.md)
  - 多轮结构化委托与自主单轮执行模式。
-   **导入路径**：[import-paths.md](references/import-paths.md)
    -   核心组件、工具和事件的规范导入路径与完整导入
        路径。

## 工作流与图编排

构建复杂图时参考以下文件：

- **函数节点**：[function-nodes.md](references/function-nodes.md)
  - 如何把函数用作节点、类型解析，以及生成器。
- **路由与条件**：[routing-and-conditions.md](references/routing-and-conditions.md)
  - 边模式、基于 dict 的路由、自循环，以及条件执行。
- **LLM 代理节点**：[llm-agent-nodes.md](references/llm-agent-nodes.md)
  - 如何把 LLM 代理用作工作流节点、任务包装器，以及处理输出 schema。
-   **高级模式**：
    [advanced-patterns.md](references/advanced-patterns.md)
    -   嵌套工作流、自定义节点类型，以及图校验规则。

## 高级编排模式

- **并行处理与扇出**：[parallel-and-fanout.md](references/parallel-and-fanout.md)
  - 用 `ParallelWorker` 做列表拆分与并发处理，以及扇出/汇合模式。
- **人在环中**：[human-in-the-loop.md](references/human-in-the-loop.md)
  - 暂停执行以等待用户输入、可恢复工作流，以及节点上的 AuthConfig。
- **动态节点**：[dynamic-nodes.md](references/dynamic-nodes.md)
  - 在运行时通过 `ctx.run_node()` 动态调度节点。

## 基础设施与实用工具

- **状态与事件**：[state-and-events.md](references/state-and-events.md)
  - 使用上下文 API、共享全局状态，以及产出事件的结构。
-   **会话与记忆**：
    [session-and-state.md](references/session-and-state.md)
    -   会话状态修改、作用域约定，以及数据库会话
        服务。
-   **回调与插件**：
    [callbacks-and-plugins.md](references/callbacks-and-plugins.md)
    -   实现回调、插件管理器集成，以及覆盖
        行为。
- **多代理系统**：[multi-agent.md](references/multi-agent.md)
  - 层级执行（例如 `SequentialAgent`、`LoopAgent`、`ParallelAgent`）。
- **测试策略**：[testing.md](references/testing.md)
  - 用 `adk run` 做自动化查询、单元测试，以及配合示例代理做集成测试。

## 标准与指南

- **最佳实践**：[best-practices.md](references/best-practices.md)
  - 关键规则（Pydantic schema、内容事件、基于 state 的数据流）。
