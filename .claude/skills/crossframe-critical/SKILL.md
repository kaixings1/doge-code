---
name: 仅在用户明确指定 crossframe-critical 进行中文结构性批评档案、文章计划或长篇批评文章时使用。
description: "仅在用户明确指定 crossframe-critical 进行中文结构性批评档案、文章计划或长篇批评文章时使用。"
category: content
risk: safe
source: community
source_repo: xi-kari/crossframe-skill
source_type: community
date_added: 2026-06-16
author: xi-kari
license: MIT
license_source: https://github.com/xi-kari/crossframe-skill/blob/main/LICENSE
tools:
  - "Agent Skills"
  - Codex
  - Claude
tags:
  - crossframe
  - chinese
  - critique
  - essay
  - structural-analysis
---
# CrossFrame Critical



## 何时使用此技能

- 仅当用户明确指定 `crossframe-critical`、`$crossframe-critical` 或要求测试此批判性平行技能时使用。
- 用于中文结构性批评档案、批评矩阵、文章计划和长篇批评文章。
- 不要将其包含在默认的 `crossframe-suite` 路由中。

## 打包源说明

此 AAS 就绪副本保留下面的原始 CrossFrame 技能主体。中文仍然是权威语义层；英文元数据仅用于发现、安装和仓库审查。

## 限制

- 技能主体是故意以中文为权威的；英文元数据用于发现，不替代原始中文术语。
- 仅在明确调用 CrossFrame 或 `crossframe-suite` 路由后使用；不要将其作为通用的默认推理层应用。
- 它构建分析、起草和审查的结构，但不替代来源验证、领域专业知识或法律、医疗或财务判断。

> **本 skill 不独立触发。** 所有 CrossFrame 任务统一从 `crossframe-suite` 入口调度。用户无需直接调用本 skill；suite 根据路由规则在需要时自动加载。

这是一个平行的本地测试技能。它不替代 `crossframe`、`crossframe-essay`、`crossframe-public` 或 `crossframe-suite`。

## Position

`crossframe-critical` writes critical Chinese essays that first use CrossFrame to establish structure, evidence boundaries, scale, mechanism candidates, and judgment grade, then sharpen the output into critique.

The critique may absorb Marxist problem awareness: interests, cost transfer, alienation, commodification, ideology, naturalized domination, and reproduction of conditions. It must not mechanically force every topic into class/capital language.

## Required Reading

On every trigger, read:

1. `../crossframe/SKILL.md`
2. `../crossframe/references/read-routing-map.md`
3. If the critique touches high-responsibility, public, AI/process artifact, lifecycle, trapped-subject, or article-output scenarios, reuse `../crossframe/templates/read-state-capsule.md` as `v5-read-state-capsule` and run `../crossframe/worksheets/source-anchor-integrity-check.md`; if the capsule is missing, return to `../crossframe/SKILL.md` instead of inventing source routing here.
4. `protocols/critical-article-protocol.md`
5. `references/critical-matrix.md`
6. `references/example-and-evidence-rules.md`
7. 若涉及真实公共对象、最新事实、机构、平台、政策、人物、公司、数据、AI/过程性产物或强判断，读取 `../crossframe/references/source-ledger-工作流.md` 并建立来源台账。
8. `templates/critical-output-template.md`

If the topic needs long-form style control, also read `../crossframe-essay/SKILL.md` and reuse only its article discipline, not its whole output contract.

## 工作流

1. Build the CrossFrame base: object, fact boundary, scale window, mechanism candidates, judgment grade, and evidence gaps.
2. Apply the critical matrix: cost chain, benefit chain, power/resource distribution, concept concealment, reproduction mechanism, weak signals, and counterconditions.
3. Plan the article: central thesis, reader position, examples, section sequence, word allocation, and ending aftertaste.
4. Write the full essay from the dossier. Default body length is 1800-2800 Chinese characters unless the user overrides it.
5. Run a final boundary check: no personality judgment, no hat-labeling, no conspiracy claim, no unverified strong judgment, no slogan replacing analysis.

## 输出

Default output has exactly three visible sections:

```text
# 批判底稿
# 篇章方案
# 正文
```

Do not collapse the result into a short answer, checklist, memo, or diagnosis summary unless the user explicitly asks for that.

## Hard Rules

- Start from CrossFrame structure, then become critical; do not begin from indignation and decorate it with structure words.
- Critique mechanisms, interests, rhetoric, institutions, and responsibility chains; do not turn structural critique into personal condemnation.
- A real or recent public event requires source checking before factual claims, with a visible source ledger summary. Unverified examples must be labeled as analogy, hypothesis, or common pattern.
- Use at least two concrete examples in the essay body unless the user provides a single narrowly bounded case and asks not to expand.
- Include at least one countercondition, evidence gap, or withdrawal condition.
- Do not use Marxist terms as prestige vocabulary. If a term cannot be translated into who pays, who benefits, what is hidden, and how the condition repeats, remove it.
