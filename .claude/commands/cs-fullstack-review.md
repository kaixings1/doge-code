---
description: 全栈工程评审 — 走过 Matt Pocock 7 个强制问题，选择配置，fork 出专项代理（api-design-reviewer、database-designer、slo-architect）。调用 cs-fullstack-engineer agent 并附带上下文 fork。
argument-hint: "<problem or codebase to review>"
---

# /cs:fullstack-review — 全栈工程评审

使用 `cs-fullstack-engineer` 智能体（使用 `context: fork` 保持父线程干净）处理此查询：

**$ARGUMENTS**

## 强制问题库

规范来源：`engineering-team/skills/senior-fullstack/references/forcing_questions.md`（7 个问题，每轮一个，建议 + 规范引用）

1. 当前团队规模 + 12 个月人员编制
2. 部署节奏（每 PR / 每日 / 每周 / 每季度）
3. 面向客户 / 内部工具 / 营销站点
4. 一年 p50 + p99 流量预测
5. 根据技术栈招聘 vs 培训团队使用技术栈
6. 第一年月度云 + SaaS 预算上限
7. 三个带有数字目标的可验证成功标准

## 路由协议

1. **遍历 7 个强制问题**，记录在 `engineering-team/skills/senior-fullstack/references/forcing_questions.md` 中。每轮一个。附规范引用提出建议。记录到 `/tmp/fullstack-grill-<date>.md`。
2. **暴露终止条件**——如果任何问题触发了一个（例如"第一天就微服务，团队规模 3"），停止并在继续前解决。
3. **运行确定性配置选择器：**
   ```bash
   python engineering-team/skills/senior-fullstack/scripts/fullstack_decision_engine.py \
     --team-size <N> --team-size-12mo <N12> --cadence <c> \
     --user-facing <true|false> --budget <USD/mo> \
     --traffic-p99-rps <N> --data-sensitivity <tier>
   ```
4. **暴露匹配的配置 + 亚军权衡**（如果在 15% 以内）。
5. **分派到专家**（一次一个，深度优先）：
   - `api-design-reviewer` 用于 API 契约
   - `database-designer` 用于 schema
   - `slo-architect` 用于可靠性目标
   - `ci-cd-pipeline-builder` 用于流水线
   - `performance-profiler` 用于性能基线
   - `cs-karpathy-reviewer` 在任何提交前

## 输出期望（≤ 200 字摘要）

- 匹配的配置 + 原因
- 三个带有数字目标的可验证成功标准
- 命名的审批链
- 调用的专家列表 + 工件路径
- 推荐的下一个子技能（如有）

## 反模式

- ❌ 捆绑强制问题——每轮一个
- ❌ 跳过终止条件检查
- ❌ 重新实现专家范围。分派——不要重复
- ❌ 自动批准生产变更。始终命名人工审批人

## 自定义

配置文件位于 `engineering-team/skills/senior-fullstack/profiles/`。要为你的组织自定义：

1. 复制 `saas-startup.json`（或最合适的）到 `<your-org>.json`。
2. 编辑 `constraints`、`stack_recommendations`、`success_thresholds`、`named_approver_chain`。
3. 决策引擎自动发现新的配置 JSON。

## 相关命令

- `/cs:frontend-review` — 仅前端深入
- `/cs:backend-review` — 仅后端深入
- `/cs:engineer-grill` — 跨角色 21 问题强制问题运行器
- `/karpathy-check` — 提交前的 Karpathy 4 原则审查
