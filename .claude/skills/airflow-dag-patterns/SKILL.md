---
name: Airflow DAG 模式
description: "使用操作器、传感器、测试和部署的最佳实践构建生产级 Apache Airflow DAG。适用于创建数据流水线、编排工作流或调度批处理作业。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Apache Airflow DAG 模式

Production-ready patterns for Apache Airflow including DAG design, operators, sensors, testing, and deployment strategies.

## 使用此技能的场景

- Creating data pipeline orchestration with Airflow
- Designing DAG structures and dependencies
- Implementing custom operators and sensors
- Testing Airflow DAGs locally
- Setting up Airflow in production
- Debugging failed DAG runs

## 不要使用此技能的场景

- You only need a simple cron job or shell script
- Airflow is not part of the tooling stack
- The task is unrelated to 工作流 orchestration

## 使用说明

1. Identify data sources, schedules, and dependencies.
2. Design idempotent tasks with clear ownership and retries.
3. Implement DAGs with observability and alerting hooks.
4. Validate in staging and document operational runbooks.

Refer to `资源/implementation-playbook.md` for detailed patterns, checklists, and templates.

## 安全

- Avoid changing production DAG schedules without approval.
- Test backfills and retries carefully to prevent data duplication.

## 资源

- `资源/implementation-playbook.md` for detailed patterns, checklists, and templates.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
