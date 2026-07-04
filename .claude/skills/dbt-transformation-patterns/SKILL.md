---
name: dbt-transformation-patterns
description: "dbt（数据构建工具）的生产就绪模式，包括模型组织、测试策略、文档和增量处理。"
risk: none
source: community
date_added: "2026-02-27"
---

# dbt 转换模式

dbt（数据构建工具）的生产就绪模式，包括模型组织、测试策略、文档和增量处理。

## 使用此技能的场景

- 使用 dbt 构建数据转换流水线
- 将模型组织为 staging、intermediate 和 marts 层
- 实现数据质量测试和文档
- 为大数据集创建增量模型
- 设置 dbt 项目结构和约定

## 不要使用此技能的场景

- The project is not using dbt or a warehouse-backed workflow
- You only need ad-hoc SQL queries
- There is no access to source data or schemas

## 使用说明

- Define model layers, naming, and ownership.
- Implement tests, documentation, and freshness checks.
- Choose materializations and incremental strategies.
- Optimize runs with selectors and CI workflows.
- If detailed patterns are required, open `resources/implementation-playbook.md`.

## 资源

- `resources/implementation-playbook.md` for detailed dbt patterns and examples.

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
