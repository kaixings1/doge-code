---
name: gsd:spec-phase
通过模糊评分明确一个阶段交付什么；在讨论阶段之前生成 SPEC.md。
argument-hint: "<phase> [--auto] [--text]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
requires: [discuss-phase, execute-phase, phase, plan-phase]
---

<objective>
通过结构化的苏格拉底式提问和定量模糊评分来明确阶段需求。

**工作流中的位置：** `spec-phase → discuss-phase → plan-phase → execute-phase → verify`

**工作原理：**
1. 加载阶段上下文（PROJECT.md、REQUIREMENTS.md、ROADMAP.md、STATE.md）
2. 侦察代码库——在提问前了解当前状态
3. 运行苏格拉底式面试循环（最多 6 轮，轮流视角）
4. 每轮后在 4 个加权维度上评分模糊度
5. 关卡：模糊度 ≤ 0.20 且所有维度达到最低要求 → 写入 SPEC.md
6. Commit SPEC.md — discuss-phase picks it up automatically on next run

**Output:** `{phase_dir}/{padded_phase}-SPEC.md` — falsifiable requirements that lock "what/why" before discuss-phase handles "how"
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/spec-phase.md
@~/.claude/get-shit-done/templates/spec.md
</execution_context>

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent.
</runtime_note>

<context>
Phase number: $ARGUMENTS (required)

**Flags:**
- `--auto` — Skip interactive questions; Claude selects recommended defaults and writes SPEC.md
- `--text` — Use plain-text numbered lists instead of TUI menus (required for `/rc` remote sessions)

Context files are resolved in-workflow using `init phase-op`.
</context>

<process>
Execute end-to-end.

**MANDATORY:** Read the workflow file BEFORE taking any action. The workflow contains the complete step-by-step process including the Socratic interview loop, ambiguity scoring gate, and SPEC.md generation. Do not improvise from the objective summary above.
</process>

<success_criteria>
- Codebase scouted for current state before questioning begins
- All 4 ambiguity dimensions scored after each interview round
- Gate passed: ambiguity ≤ 0.20 AND all dimension minimums met
- SPEC.md written with falsifiable requirements, explicit boundaries, and acceptance criteria
- SPEC.md committed atomically
- User knows they can now run /gsd:discuss-phase which will load SPEC.md automatically
</success_criteria>
