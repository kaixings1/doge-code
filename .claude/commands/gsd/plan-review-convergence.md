---
name: gsd:plan-review-convergence
跨 AI 规划融合循环 - 根据审查反馈重新规划，直到没有 HIGH 级别的顾虑。
argument-hint: "<phase> [--codex] [--gemini] [--claude] [--opencode] [--ollama] [--lm-studio] [--llama-cpp] [--text] [--ws <name>] [--all] [--max-cycles N]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
requires: [phase, review]
---

<objective>
跨 AI 规划融合循环——gsd-review 和 gsd-planner 的外部修订关卡。
重复操作：使用外部 AI CLI 审查计划 → 如果发现 HIGH 级别的顾虑 → 使用 --reviews 反馈重新规划 → 重新审查。当没有剩余的 HIGH 级别顾虑或达到最大循环次数时停止。

**流程：** Agent→Skill("gsd-plan-phase") → Agent→Skill("gsd-review") → 检查 HIGH → Agent→Skill("gsd-plan-phase --reviews") → Agent→Skill("gsd-review") → ... → 融合或升级

用外部 AI 审查员（codex、gemini 等）替换 gsd-plan-phase 的内部 gsd-plan-checker。每个步骤在调用相应现有技能的隔离 Agent 内运行——编排器仅进行循环控制。

**编排器角色：** 解析参数、验证阶段、为现有技能生成 Agent、检查 HIGH、停滞检测、升级关卡。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/plan-review-convergence.md
@$HOME/.claude/get-shit-done/references/revision-loop.md
@$HOME/.claude/get-shit-done/references/gates.md
@$HOME/.claude/get-shit-done/references/agent-contracts.md
</execution_context>

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent — `vscode_askquestions` is the VS Code Copilot implementation of the same interactive question API. Do not skip questioning steps because `AskUserQuestion` appears unavailable; use `vscode_askquestions` instead.
</runtime_note>

<context>
Phase number: extracted from $ARGUMENTS (required)

**Flags:**
- `--codex` — Use Codex CLI as reviewer (default if no reviewer specified)
- `--gemini` — Use Gemini CLI as reviewer
- `--claude` — Use Claude CLI as reviewer (separate session)
- `--opencode` — Use OpenCode as reviewer
- `--ollama` — Use local Ollama server as reviewer (OpenAI-compatible, default host `http://localhost:11434`; configure model via `review.models.ollama`)
- `--lm-studio` — Use local LM Studio server as reviewer (OpenAI-compatible, default host `http://localhost:1234`; configure model via `review.models.lm_studio`)
- `--llama-cpp` — Use local llama.cpp server as reviewer (OpenAI-compatible, default host `http://localhost:8080`; configure model via `review.models.llama_cpp`)
- `--all` — Use all available CLIs and running local model servers
- `--max-cycles N` — Maximum replan→review cycles (default: 3)

**Feature gate:** This command requires `workflow.plan_review_convergence=true`. Enable with:
`gsd config-set workflow.plan_review_convergence true`
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (pre-flight, revision loop, stall detection, escalation).
</process>
