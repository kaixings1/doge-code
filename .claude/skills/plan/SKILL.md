---
name: omc-plan
description: "Plan — Plan 相关功能和最佳实践"
argument-hint: "[--direct|--consensus|--review] [--interactive] [--deliberate] <task description>"
pipeline: [deep-interview]
handoff-policy: approval-required
handoff: .omc/plans/ralplan-*.md
level: 4
---

<Purpose>
Plan creates comprehensive, actionable work plans through intelligent interaction. It auto-detects whether to interview the user (broad requests) or plan directly (detailed requests), and supports consensus mode (iterative Planner/Architect/Critic loop with RALPLAN-DR structured deliberation) and review mode (Critic evaluation of existing plans).
</Purpose>

<Use_When>

- User wants to plan before implementing -- "plan this", "plan the", "let's plan"
- User wants structured requirements gathering for a vague idea
- User wants an existing plan reviewed -- "review this plan", `--review`
- User wants multi-perspective consensus on a plan -- `--consensus`, "ralplan"
- Task is broad or vague and needs scoping before any code is written
  </Use_When>

<Do_Not_Use_When>

- User wants autonomous end-to-end execution -- use `autopilot` instead
- User wants to start coding immediately with a clear task -- use `ralph` or delegate to executor
- User asks a simple question that can be answered directly -- just answer it
- Task is a single focused fix with obvious scope -- use an execution skill instead of running it from this planning module
  </Do_Not_Use_When>

<Why_This_Exists>
Jumping into code without understanding requirements leads to rework, scope creep, and missed edge cases. Plan provides structured requirements gathering, expert analysis, and quality-gated plans so that execution starts from a solid foundation. The consensus mode adds multi-perspective validation for high-stakes projects.
</Why_This_Exists>

<Execution_Policy>

- Auto-detect interview vs direct mode based on request specificity
- Ask one question at a time during interviews -- never batch multiple questions
- Gather codebase facts via `explore` agent before asking the user about them
- Plans must meet quality standards: 80%+ claims cite file/line, 90%+ criteria are testable
- Consensus mode runs fully automated by default; add `--interactive` to enable user prompts at draft review and final approval steps
- Consensus mode uses RALPLAN-DR short mode by default; switch to deliberate mode with `--deliberate` or when the request explicitly signals high risk (auth/security, data migration, destructive/irreversible changes, production incident, compliance/PII, public API breakage)
- **Planning/execution boundary:** planning modes inspect context and produce plans/specs/proposals only. They MUST mark artifacts as `pending approval` unless the user has explicitly opted into execution in the current turn or via the structured approval UI. Before explicit execution approval, planning modes MUST NOT run mutation-oriented shell commands, edit source files, commit, push, open PRs, invoke execution skills, or delegate implementation tasks.
- **Goal workflow boundary:** when a plan compares Claude Code `/goal`, Ralph, Team, UltraQA, or artifact-only Ultragoal, identify exactly one primary loop authority and use the deterministic conflict policies `refuse`, `adopt_existing`, and `artifact_only` rather than non-deterministic warning handling. `/goal` facts must cite Claude Code/Anthropic sources only (Claude Code `/goal` docs: https://code.claude.com/docs/en/goal; Anthropic Claude Code changelog: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md), and plans MUST NOT claim the `/goal` evaluator independently runs commands or reads files; require surfaced proof evidence before any completion claim.
- **Goal workflow doc target:** for user-facing comparisons, keep examples aligned with `docs/shared/mode-selection-guide.md#goal-oriented-workflow-selection` and `docs/REFERENCE.md#goal-workflow-ux-goal-ralph-team-ultraqa-ultragoal`.
  </Execution_Policy>

<Steps>

### Mode Selection

| Mode      | Trigger                         | Behavior                                                                                                                                                                                                       |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 30 MINUTES 44 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE