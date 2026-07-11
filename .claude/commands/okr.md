---
name: OKR
description: "从公司战略到团队目标生成 OKR 级联。用法: /okr generate <strategy>"
---

# /okr

从公司级战略到团队级关键结果生成级联的 OKR 框架。

## Usage

```
/okr generate <strategy>                                     Generate OKR cascade
```

Supported strategies: `growth`, `retention`, `revenue`, `innovation`, `operational`

## Input Format

Pass a strategy keyword directly. The generator produces company, department, and team-level OKRs aligned to the chosen strategy.

## Examples

```
/okr generate growth
/okr generate retention
/okr generate revenue
/okr generate innovation
/okr generate operational
/okr generate growth --json
```

## Scripts
- `product-team/skills/product-strategist/scripts/okr_cascade_generator.py` — OKR cascade generator (`<strategy> [--teams "A,B,C"] [--contribution 0.3] [--json]`)

## Skill Reference
> `product-team/skills/product-strategist/SKILL.md`
