---
name: Karpathy检查
description: 运行 Karpathy 四原则评审 — 检查暂存变更或最后提交（复杂度/diff 噪声/假设/目标验证）。用法 /karpathy-check [--last-commit]
---
<!-- canonical copy: engineering/karpathy-coder/commands/karpathy-check.md — keep in sync (root copy uses repo-root-relative script paths) -->

# /karpathy-check

根据 Karpathy 的四项编码原则审查你的暂存更改（或最后一次提交）。

## 用法

```
/karpathy-check                 # 审查暂存更改
/karpathy-check --last-commit   # 审查最近的提交
```

## 运行内容

1. **原则 #2（简洁性）：** 对所有更改的文件运行 `complexity_checker.py` — 检测过度工程、过早抽象、深层嵌套、过长函数
2. **原则 #3（外科手术式）：** 对 diff 运行 `diff_surgeon.py` — 检测仅注释更改、空白噪点、风格漂移、附带重构
3. **原则 #1 + #4（思考 + 目标）：** `karpathy-reviewer` 智能体读取 diff 并应用人工判断检查 — 隐藏假设、缺少验证

## 输出

带有每个原则的判定结果和具体行级修复建议的结构化报告。

## When to run

- Before committing (catches noise and overcomplication early)
- After completing a feature (sanity check before PR)
- When you suspect the LLM overcoded something

## Sub-agent

Dispatches the `karpathy-reviewer` agent. See `agents/karpathy-reviewer.md`.

## Scripts

- `engineering/karpathy-coder/skills/karpathy-coder/scripts/complexity_checker.py`
- `engineering/karpathy-coder/skills/karpathy-coder/scripts/diff_surgeon.py`
- `engineering/karpathy-coder/skills/karpathy-coder/scripts/assumption_linter.py`
- `engineering/karpathy-coder/skills/karpathy-coder/scripts/goal_verifier.py`

## Skill Reference

→ `engineering/karpathy-coder/skills/karpathy-coder/SKILL.md`
