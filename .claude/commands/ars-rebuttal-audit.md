---
description: ARS 学术论文 `rebuttal-audit` 模式 — 对照审稿意见对现有 rebuttal 草稿做质量检查
model: sonnet
---

Trigger the `academic-paper` skill in `rebuttal-audit` mode. Requires BOTH the reviewer comments AND an existing rebuttal/response draft to evaluate. Produces an advisory QA report (per-comment coverage + gaps + risk flags). Does NOT generate a new response, and does NOT emit Schema 11 / Material Passport / verified status (standalone invocation runs outside the pipeline). Fidelity spectrum, low oversight.

If only reviewer comments are present (no draft yet), use `revision-coach` instead.

Mode reference: `MODE_REGISTRY.md` § academic-paper.
Skill entry: `academic-paper/SKILL.md`.
