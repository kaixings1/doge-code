---
name: cqrs-implementation
description: "为可扩展架构实施命令查询职责分离。适用于分离读写模型、优化查询性能或构建事件溯源系统。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# CQRS 实现

实现 CQRS（命令查询职责分离）模式的全面指南。

## 使用此技能的场景

- 分离读和写关注点
- 独立于写入扩展读取
- 构建事件溯源系统
- 优化复杂查询场景
- 需要不同的读/写数据模型
- 需要高性能报告

## 不要使用此技能的场景

- The domain is simple and CRUD is sufficient
- You cannot operate separate read/write models
- Strong immediate consistency is required everywhere

## 使用说明

- Identify read/write workloads and consistency needs.
- Define command and query models with clear boundaries.
- Implement read model projections and synchronization.
- Validate performance, recovery, and failure modes.
- If detailed patterns are required, open `resources/implementation-playbook.md`.

## 资源

- `resources/implementation-playbook.md` for detailed CQRS patterns and templates.

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
