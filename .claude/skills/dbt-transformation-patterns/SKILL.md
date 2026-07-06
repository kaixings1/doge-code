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

- The project is not using dbt or a warehouse-backed 工作流
- You only need ad-hoc SQL queries
- There is no access to source data or schemas

## 使用说明

- Define model layers, naming, and ownership.
- Implement tests, documentation, and freshness checks.
- Choose materializations and incremental strategies.
- Optimize runs with selectors and CI workflows.
- If detailed patterns are required, open `resources/implementation-playbook.md`.

## 资源

- `resources/implementation-playbook.md` for detailed dbt patterns and 示例.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
