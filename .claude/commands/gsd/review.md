---
name: gsd:review
从外部 AI CLI 请求跨 AI 同行评审阶段计划。
argument-hint: "--phase N [--gemini] [--claude] [--codex] [--opencode] [--qwen] [--cursor] [--all]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
requires: [config, phase, plan-phase]
---

<objective>
调用外部 AI CLI（Gemini、Claude、Codex、OpenCode、Qwen Code、Cursor）独立审查阶段计划。
生成结构化的 REVIEWS.md，包含每个审查员的反馈，可通过 /gsd:plan-phase --reviews 反馈到规划中。

**流程：** 检测 CLI → 构建审查提示 → 调用每个 CLI → 收集响应 → 写入 REVIEWS.md
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/review.md
</execution_context>

<context>
Phase number: extracted from $ARGUMENTS (required)

**Flags:**
- `--gemini` — Include Gemini CLI review
- `--claude` — Include Claude CLI review (uses separate session)
- `--codex` — Include Codex CLI review
- `--opencode` — Include OpenCode review (uses model from user's OpenCode config)
- `--qwen` — Include Qwen Code review (Alibaba Qwen models)
- `--cursor` — Include Cursor agent review
- `--all` — Include all available CLIs
</context>

<process>
Execute end-to-end.
</process>
