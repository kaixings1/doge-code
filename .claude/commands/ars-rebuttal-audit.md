---
description: ARS 学术论文 `rebuttal-audit` 模式 — 对照审稿意见对现有 rebuttal 草稿做质量检查
model: sonnet
---

以 `rebuttal-audit` 模式触发 `academic-paper` 技能。需要同时提供审稿人评论和现有的 rebuttal/回复草稿进行评估。生成咨询性 QA 报告（每条评论的覆盖范围 + 差距 + 风险标记）。不会生成新的回复，也不会发出 Schema 11 / Material Passport / 验证状态（独立调用在流水线外运行）。保真度谱系，低监督需求。

如果只有审稿人评论（尚无草稿），请改用 `revision-coach`。

模式参考：`MODE_REGISTRY.md` § academic-paper。
技能入口：`academic-paper/SKILL.md`。
