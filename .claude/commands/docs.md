---
description: documentation-lookup 技能的后备斜杠入口。优先直接使用该技能。
---

# Docs Command (Legacy Shim)

Use this only if you still reach for `/docs`. The maintained workflow lives in `skills/documentation-lookup/SKILL.md`.

## Canonical Surface

- Prefer the `documentation-lookup` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

`$ARGUMENTS`

## Delegation

Apply the `documentation-lookup` skill.
- If the library or the question is missing, ask for the missing part.
- Use live documentation through Context7 instead of training data.
- Return only the current answer and the minimum code/example surface needed.
