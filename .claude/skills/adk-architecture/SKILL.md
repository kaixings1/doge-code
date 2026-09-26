---
name: adk-architecture
description: ADK 架构知识 — 图编排、恢复、执行流、节点契约、可观测性和 LLM 上下文编排。在需要理解 ADK 系统的架构、事件流或状态管理，或设计/修改核心组件时使用。
---

# ADK 架构指南

## 核心接口 (references/interfaces/)
- [BaseNode](references/interfaces/base-node.md) — 节点契约、输出/流式、状态/路由、HITL、配置
- [Workflow](references/interfaces/workflow.md) — 图编排、动态节点（跟踪/去重/恢复）、传递性动态节点、中断传播、面向节点作者的设计规则
- [Runner](references/interfaces/runner.md) — 执行工作流与 agent 的公共接口。记录了入口方法 `run` 和 `run_async`。
- [Agent](references/interfaces/agent.md) — 定义身份、指令和工具的蓝图。记录了 `run` 是首选的入口方法。
- [BaseAgent](references/interfaces/base-agent.md) — 所有 agent 的基类。定义了以 `_run_impl` 作为主要重写点的子类化契约。
- [Event](references/interfaces/event.md) — 用于状态重建和通信的核心数据结构。表示一次对话轮次、动作以及状态生命周期的不可变性。

## 关键原则 (references/principles/)
- [API 原则](references/principles/api-principles.md) — 稳定性、向后兼容性和自包含性。在做出影响公共 API 表面的设计选择时使用。

## 运行时知识 (references/architecture/)
- [Context](references/architecture/context.md) — 1:1 节点-上下文映射、InvocationContext 单例、属性参考
- [NodeRunner](references/architecture/node-runner.md) — 两条通信通道、执行流、输出委托。内部运行时细节。
- [Runner 角色](references/architecture/runner-roles.md) — Runner vs NodeRunner vs Workflow 的职责分离。解释了它们为何被分离以避免死锁。
- [检查点与恢复](references/architecture/checkpoint-resume.md) — HITL 生命周期、`rerun_on_resume`、`run_id`
- [可观测性](references/architecture/observability.md) — span-on-Context 设计、NodeRunner 集成、关联日志、指标
- [LLM 上下文编排](references/architecture/llm-context-orchestration.md) — 事件与 LLM 上下文之间的关系、任务委托转换、分支隔离。在修改事件处理、为 LLM 准备上下文或调试上下文污染问题时使用。
