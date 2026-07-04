---
name: analyze-project
description: Antigravity 会话的取证根因分析器：范围偏差、返工模式、热点分析和提示改进。
risk: unknown
source: community
version: "1.0"
tags: [analysis, diagnostics, meta, root-cause, project-health, session-review]
---

# /analyze-project — 根因分析工作流

Analyze AI-assisted coding sessions in `~/.gemini/antigravity/brain/` and produce a report that explains not just **what happened**, but **why it happened**, **who/what caused it**, and **what should change next time**.

## Goal

For each session, determine:

1. What changed from the initial ask to the final executed work
2. Whether the main cause was:
   - user/spec
   - agent
   - repo/codebase
   - validation/testing
   - legitimate task complexity
3. Whether the opening prompt was sufficient
4. Which files/subsystems repeatedly correlate with struggle
5. What changes would most improve future sessions

## 使用场景
- You need a postmortem on AI-assisted coding sessions, especially when scope drift or repeated rework occurred.
- You want root-cause analysis that separates user/spec issues from agent mistakes, repo friction, or validation gaps.
- You need evidence-backed recommendations for improving future prompts, repo health, or delivery workflows.

## Global Rules

- Treat `.resolved.N` counts as **iteration signals**, not proof of failure
- Separate **human-added scope**, **necessary discovered scope**, and **agent-introduced scope**
- Separate **agent error** from **repo friction**
- Every diagnosis must include **evidence** and **confidence**
- Confidence levels:
  - **High** = direct artifact/timestamp evidence
  - **Medium** = multiple supporting signals
  - **Low** = plausible inference, not directly proven
- Evidence precedence:
  - artifact contents > timestamps > metadata summaries > inference
- If evidence is weak, say so
