---
description: 深度功能修复 — 系统化修复整个功能/模块。用法: /focused-fix <feature-path>
---

使用 focused-fix 5 阶段协议系统修复 `$ARGUMENTS` 处的功能/模块。

如果 `$ARGUMENTS` 为空，询问要修复哪个功能/模块。

读取 `engineering/focused-fix/SKILL.md` 并按顺序执行全部 5 个阶段：

1. **SCOPE** — Map the feature boundary (all files, entry points, internal files)
2. **TRACE** — Map inbound + outbound dependencies across the entire codebase
3. **DIAGNOSE** — Check code, runtime, tests, logs, config. Assign risk labels (HIGH/MED/LOW). Confirm root causes with evidence.
4. **FIX** — Repair in order: deps → types → logic → tests → integration. One fix at a time, test after each. 3-strike escalation if fixes cascade.
5. **VERIFY** — Run all feature tests + consumer tests. Summarize changes.

**Iron Law:** No fixes before completing Phase 3. No exceptions.
