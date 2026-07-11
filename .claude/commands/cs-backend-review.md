---
description: 后端工程评审 — 走过 Matt Pocock 7 个强制问题（读写比+QPS、租户、同步/异步、数据敏感性、模式、RPO/RTO、SLO），选择语言+模式配置，fork 出专项代理（api-design-reviewer、database-designer、migration-architect、slo-architect）。调用 cs-backend-engineer agent 并附带上下文 fork。
argument-hint: "<problem or service to review>"
---

# /cs:backend-review — 后端工程评审

使用 `cs-backend-engineer` 智能体（使用 `context: fork`）处理此查询：

**$ARGUMENTS**

## 强制问题库

规范来源：`engineering-team/skills/senior-backend/references/forcing_questions.md`（7 个问题，每轮一个，建议 + 规范引用）

1. 读写比 + 一年 p99 QPS
2. 租户模型（单租户 / 共享 / 隔离多租户）
3. 同步请求/响应 vs 异步（队列）vs 事件驱动
4. 数据敏感等级（公开 / 内部 / PII / PHI / PCI）
5. 单体 / 模块化单体 / 微服务（团队规模论证）
6. RPO 和 RTO
7. SLO + 命名的错误预算消费者

## 路由协议

1. **遍历 7 个强制问题**，记录在 `engineering-team/skills/senior-backend/references/forcing_questions.md` 中。每轮一个。附规范引用提出建议。记录到 `/tmp/backend-grill-<date>.md`。
2. **暴露终止条件**——例如"微服务，团队规模 5"触发（Newman's MonolithFirst）。停止并解决。
3. **运行确定性配置选择器：**
   ```bash
   python engineering-team/skills/senior-backend/scripts/backend_decision_engine.py \
     --team-size <N> --qps-p99 <N> --read-write-ratio <ratio> \
     --tenancy <single-tenant|shared-multi-tenant|isolated-multi-tenant> \
     --data-sensitivity <public|pii|phi|pci> \
     --pattern <monolith|modular-monolith|domain-bounded-services|microservices|serverless> \
     --language-preference <typescript|python|go|rust|java|kotlin|dotnet>
   ```
4. **暴露匹配的配置 + 命名的审批链**用于技术栈变更 / schema 迁移 / 外部服务。
5. **按依赖顺序分派到专家：**
   - `slo-architect` 优先——无 SLO，无设计
   - `api-design-reviewer` — API 契约
   - `database-designer` + `database-schema-designer` — schema + ERD
   - `migration-architect` — 仅当更改现有 schema 时
   - `observability-designer` — 黄金信号 + 告警
   - `ci-cd-pipeline-builder` — 匹配节奏目标的流水线
   - `senior-security` + `adversarial-reviewer` — 公开上线前
   - `ra-qm-team/*` — 如果数据敏感度为 PHI / PCI / 受监管
   - `cs-karpathy-reviewer` — 在任何提交前

## 输出期望（≤ 200 字摘要）

- 匹配的配置 + 原因
- 三个 SLO 目标（p50、p99 延迟 + 正常运行时间）
- RPO + RTO
- 命名的审批链（技术负责人 + 值班人员 + DBA + ...）
- 调用的专家列表 + 工件路径
- 推荐的下一个子技能

## 反模式

- ❌ 在命名第二个需要它的团队之前推荐 Kafka / 事件驱动
- ❌ 在团队规模 < 30 + 平台团队 + 有界上下文独立性之前推荐微服务
- ❌ 设计 API 而不分派到 `api-design-reviewer`
- ❌ 在没有 QPS + 读写比的情况下推荐数据库（问题 1 未回答）
- ❌ 自动批准生产 schema 迁移。始终命名值班人员 + DBA

## 自定义

配置文件位于 `engineering-team/skills/senior-backend/profiles/`。四个内置配置：`node-express`、`fastapi-python`、`django-monolith`、`go-or-rust-microservice`。复制一个到 `<your-org>.json` 并调整约束 / SLO 下限 / 审批链。

## 相关命令

- `/cs:fullstack-review` — 全栈视角（父级）
- `/cs:frontend-review` — 用于 API 消费者端
- `/cs:engineer-grill` — 跨角色 21 问题审查
- `/slo-design` — 通过 slo-architect 的显式 SLO 设计
- `/karpathy-check` — Karpathy 4 原则审查
