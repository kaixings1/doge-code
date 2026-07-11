---
description: "跨角色工程 grill — 每个角色 7 个 Matt Pocock 问题 × 3 角色（全栈/前端/后端）= 最多 21 个强制问题，每轮一个，配有规范引用和终止标准。默认先问哪个方向；`--all` 运行全部 21 个。"
argument-hint: "<plan or architecture to grill> [--lane fullstack|frontend|backend|all]"
---

# /cs:engineer-grill — 跨角色工程强制问题审查

在用户锁定任何工程决策之前，引导他们通过 Matt Pocock 强制问题纪律。这是应用于三个工程角色领域的**带文档审查**模式（基于规范、推荐答案、终止条件）。

**$ARGUMENTS**

## 路由协议

1. **检测用户提示中的领域信号：**
   - **全栈信号：** "scaffold"、"stack"、"Next.js + Postgres"、"monorepo"、"deploy"、"team size"、"budget"、"cadence"
   - **前端信号：** "React"、"Next"、"Remix"、"Vite"、"Astro"、"bundle"、"LCP"、"INP"、"CLS"、"a11y"、"WCAG"、"Tailwind"、"design system"
   - **后端信号：** "API"、"REST"、"GraphQL"、"database"、"Postgres"、"MongoDB"、"schema"、"migration"、"QPS"、"tenancy"、"SLO"、"Kafka"、"queue"、"microservice"、"monolith"

2. **如果提供了 `--lane <name>`：** 仅走该领域的 7 个问题。
3. **如果领域信号对一个领域得分 ≥ 3：** 与用户确认，然后走该领域的 7 个问题。
4. **如果领域信号模糊或 `--lane all`：** 询问用户："全栈（7 个关于团队/技术栈/规模的问题）、前端（7 个关于设备/渲染/包/无障碍的问题）还是后端（7 个关于 QPS/租户/模式/SLO 的问题）？或者 `all` 全部 21 个。"

## 领域：全栈

问题位于 `engineering-team/skills/senior-fullstack/references/forcing_questions.md`。摘要：

1. 当前团队规模 + 12 个月人员编制？
2. 部署节奏——每 PR、每日、每周、每季度？
3. 面向客户、内部工具还是营销站点？
4. 一年 p50 / p99 流量预测？
5. 根据技术栈招聘还是培训团队？
6. 第一年月度云 + SaaS 上限？
7. 三个带有数字目标的可验证成功标准？

## 领域：前端

问题位于 `engineering-team/skills/senior-frontend/references/forcing_questions.md`。摘要：

1. 主要设备 + 网络（移动 4G / 桌面光纤 / 低端安卓 / 企业）？
2. LCP 目标（毫秒）以及 INP、CLS？
3. RSC / SPA / SSR / SSG — 选择并辩护？
4. 每条路由的 JS 包预算（KB-gzip）？
5. 依赖 SEO 还是需要认证？
6. 设计系统事实来源？
7. WCAG 目标 + 命名的无障碍负责人？

## 领域：后端

问题位于 `engineering-team/skills/senior-backend/references/forcing_questions.md`。摘要：

1. 读写比 + p99 QPS 预测？
2. 租户模型——单租户 / 共享 / 隔离？
3. 同步 / 异步 / 事件驱动——默认 + 例外？
4. 数据敏感等级——PII / PHI / PCI？
5. 单体 / 模块化单体 / 微服务——团队规模论证？
6. RPO + RTO？
7. SLO + 命名的错误预算消费者？

## 纪律（Matt Pocock，MIT，逐字保留自 `engineering/grill-me`）

1. **每轮一个问题。** 绝不捆绑。绝不默认为"你怎么看？"。
2. **始终推荐一个答案。** 格式："推荐：<答案>，因为<来自引用规范的一句话理由>"。
3. **深度优先遍历。** 在打开另一个领域之前完成一个领域。
4. **暴露终止条件。** 如果用户的答案触发了它，停止并在继续前解决。
5. **记录答案。** 写入 `/tmp/engineer-grill-<lane>-<date>.md`，以便对话在压缩后仍然保留。

## 审查之后

1. **运行该领域的决策引擎**，使用七个答案：
   - 全栈 → `python engineering-team/skills/senior-fullstack/scripts/fullstack_decision_engine.py ...`
   - 前端 → `python engineering-team/skills/senior-frontend/scripts/frontend_decision_engine.py ...`
   - 后端 → `python engineering-team/skills/senior-backend/scripts/backend_decision_engine.py ...`
2. **暴露匹配的配置 + 命名的审批人。**
3. **基于组合图推荐下一个子技能链。**

## 输出期望

- 每个走过的领域一个工件，写入 `/tmp/engineer-grill-<lane>-<date>.md`。
- 一个最终摘要（≤ 250 字），总结每个领域的匹配配置 + 三个最高杠杆的下一步操作。
- **绝不**自动批准技术栈变更、schema 迁移或架构选择。

## 相关命令

- `/cs:fullstack-review`、`/cs:frontend-review`、`/cs:backend-review` — 单领域深入
- `/karpathy-check` — 提交前的 Karpathy 审查
- `/cs:grill-bizops`、`/cs:grill-commercial` — 兄弟跨域审查（BizOps + Commercial v2.8.0）
