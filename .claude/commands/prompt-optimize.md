---
description: prompt-optimizer 技能的后备斜杠入口。优先直接使用该技能。
---

# Prompt Optimize (Legacy Shim)

Use this only if you still invoke `/prompt-optimize`. The maintained workflow lives in `skills/prompt-optimizer/SKILL.md`.

## Canonical Surface

- Prefer the `prompt-optimizer` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

`$ARGUMENTS`

## Delegation

Apply the `prompt-optimizer` skill.
- Keep it advisory-only: optimize the prompt, do not execute the task.
- Return the recommended ECC components plus a ready-to-run prompt.
- If the user actually wants direct execution, say so and tell them to make a normal task request instead of staying inside the shim.
