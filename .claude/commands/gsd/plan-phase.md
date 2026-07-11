---
name: gsd:plan-phase
创建包含验证循环的详细阶段计划（PLAN.md）。
argument-hint: "[phase] [--auto] [--research] [--skip-research] [--research-phase <N>] [--view] [--gaps] [--skip-verify] [--prd <file>] [--ingest <path-or-glob>] [--ingest-format <auto|nygard|madr|narrative>] [--reviews] [--text] [--tdd] [--mvp]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - WebFetch
  - mcp__context7__*
requires: [discuss-phase, phase, review, update]
---
<objective>
为路线图阶段创建带有集成研究和验证的可执行阶段提示（PLAN.md 文件）。

**默认流程：** 研究（如果需要）→ 规划 → 验证 → 完成

**仅研究模式（`--research-phase <N>`）：** 为阶段 `N` 生成 `gsd-phase-researcher`，写入 `RESEARCH.md`，然后在规划器运行前退出。适用于跨阶段研究、在承诺规划方法前的文档审查，以及仅迭代研究比重启规划器成本更低的无需重新规划的修正循环。替代已删除的 research-phase 命令（#3042）。

**仅研究修饰符：**
- **无标志**——当 `RESEARCH.md` 已存在时，提示用户选择 `update / view / skip`。
- **`--research`**——强制刷新：无条件重新生成研究员，不提示。跳过现有的 RESEARCH.md 菜单。
- **`--view`**——仅查看：将现有的 `RESEARCH.md` 打印到标准输出。不生成研究员。对于无需重新规划的修正循环来说是最便宜的模式。如果 `RESEARCH.md` 尚不存在，则报错并提示去掉 `--view`。

**编排器角色：** 解析参数、验证阶段、研究领域（除非跳过）、生成 gsd-planner、使用 gsd-plan-checker 验证、迭代直到通过或达到最大迭代次数、展示结果。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/plan-phase.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent — `vscode_askquestions` is the VS Code Copilot implementation of the same interactive question API. Do not skip questioning steps because `AskUserQuestion` appears unavailable; use `vscode_askquestions` instead.
</runtime_note>

<context>
Phase number: $ARGUMENTS (optional — auto-detects next unplanned phase if omitted)

**Flags:**
- `--research` — Force re-research even if RESEARCH.md exists
- `--skip-research` — Skip research, go straight to planning
- `--gaps` — Gap closure mode (reads VERIFICATION.md, skips research)
- `--skip-verify` — Skip verification loop
- `--prd <file>` — Use a PRD/acceptance criteria file instead of discuss-phase. Parses requirements into CONTEXT.md automatically. Skips discuss-phase entirely.
- `--ingest <path-or-glob>` — Use one or more ADR files instead of discuss-phase. Parses locked decisions + scope fences into CONTEXT.md automatically. Skips discuss-phase entirely.
- `--ingest-format <auto|nygard|madr|narrative>` — Optional ADR parser format override (`auto` default).
- `--reviews` — Replan incorporating cross-AI review feedback from REVIEWS.md (produced by `/gsd:review`)
- `--text` — Use plain-text numbered lists instead of TUI menus (required for `/rc` remote sessions)
- `--mvp` — Vertical MVP mode. Planner organizes tasks as feature slices (UI→API→DB) instead of horizontal layers. On Phase 1 of a new project, also emits `SKELETON.md` (Walking Skeleton). Can be persisted on a phase via `**Mode:** mvp` in ROADMAP.md.

Normalize phase input in step 2 before any directory lookups.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (validation, research, planning, verification loop, routing).
</process>
