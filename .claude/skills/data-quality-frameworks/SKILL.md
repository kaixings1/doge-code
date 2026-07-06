---
name: data-quality-frameworks
description: "使用 Great Expectations、dbt 测试和数据契约实施数据质量验证。适用于构建数据质量流水线、实施验证规则或建立数据契约。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Data Quality Frameworks

Production patterns for implementing data quality with Great Expectations, dbt tests, and data contracts to ensure reliable data pipelines.

## 使用此技能的场景

- Implementing data quality checks in pipelines
- Setting up Great Expectations validation
- Building comprehensive dbt test suites
- Establishing data contracts between teams
- Monitoring data quality metrics
- Automating data validation in CI/CD

## 不要使用此技能的场景

- The data sources are undefined or unavailable
- You cannot modify validation rules or schemas
- The task is unrelated to data quality or contracts

## 使用说明

- Identify critical datasets and quality dimensions.
- Define expectations/tests and contract rules.
- Automate validation in CI/CD and schedule checks.
- Set alerting, ownership, and remediation steps.
- If detailed patterns are required, open `resources/implementation-playbook.md`.

## 安全

- Avoid blocking critical pipelines without a fallback plan.
- Handle sensitive data securely in validation outputs.

## 资源

- `resources/implementation-playbook.md` for detailed frameworks, templates, and 示例.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
