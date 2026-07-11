---
name: 迭代回顾
description: "分析迭代回顾中的模式与行动事项追踪。用法: /retro analyze <retro_data.json>"
---

# /retro

分析回顾数据以发现重复出现的主题、情绪趋势和行动项效果。

## Usage

```
/retro analyze <retro_data.json>                             Full retrospective analysis
```

## Input Format

```json
{
  "sprint_name": "Sprint 24",
  "went_well": ["CI pipeline improvements", "Pair programming sessions"],
  "improvements": ["Too many meetings", "Flaky integration tests"],
  "action_items": [
    {"description": "Reduce standup to 10 min", "owner": "SM", "status": "done"},
    {"description": "Fix flaky tests", "owner": "QA Lead", "status": "in_progress"}
  ],
  "participants": 8
}
```

## Examples

```
/retro analyze sprint-24-retro.json
/retro analyze sprint-24-retro.json --format json
```

## Scripts
- `project-management/skills/scrum-master/scripts/retrospective_analyzer.py` — Retrospective analyzer (`<data_file> [--format text|json]`)

## Skill Reference
> `project-management/skills/scrum-master/SKILL.md`
