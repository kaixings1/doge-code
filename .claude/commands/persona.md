---
name: 用户画像
description: "为 UX 研究和产品设计生成数据驱动的用户画像。用法: /persona generate [options]"
---

# /persona

生成包含人口统计数据、目标、痛点和行为模式的结构化用户画像。

## Usage

```
/persona generate                                            Generate persona (interactive)
/persona generate json                                       Generate persona as JSON
```

## Input Format

Interactive mode prompts for product context. Alternatively, provide context inline:

```
/persona generate
> Product: B2B project management tool
> Target: Engineering managers at mid-size companies
> Key problem: Cross-team visibility
```

## Examples

```
/persona generate
/persona generate json
/persona generate json > persona-eng-manager.json
```

## Scripts
- `product-team/skills/ux-researcher-designer/scripts/persona_generator.py` — Persona generator (positional `json` arg for JSON output)

## Skill Reference
> `product-team/skills/ux-researcher-designer/SKILL.md`
