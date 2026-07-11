---
name: 适用于任务需要详尽完整的输出、完整文件或严格防止占位符和跳过代码的情况。
description: "适用于任务需要详尽完整的输出、完整文件或严格防止占位符和跳过代码的情况。"
category: frontend
risk: safe
source: community
source_repo: Leonxlnx/taste-skill
source_type: community
date_added: "2026-04-17"
author: Leonxlnx
tags: [output, code-generation, quality]
tools: [claude, 游标, codex, antigravity]
---
# Full-Output Enforcement

## 使用场景

- Use when the user explicitly asks for full files, complete implementations, exhaustive lists, or unabridged deliverables.
- Use when placeholder code, skipped sections, TODO stubs, or descriptions in place of implementation would break the 请求.
- Use when a long answer may need clean continuation chunks without losing completeness or structural integrity.

## 局限性

- This skill enforces completeness, but it does not override 令牌 limits, safety constraints, missing source context, or user-provided scope boundaries.
- Split long outputs into clearly labeled continuation chunks when necessary, and verify that each chunk connects cleanly to the previous one.
- Do not invent unavailable code, credentials, private APIs, or project files to satisfy a 请求 for complete output.


## Baseline

Treat every task as production-critical. A partial output is a broken output. Do not optimize for brevity — optimize for completeness. If the user asks for a full file, deliver the full file. If the user asks for 5 components, deliver 5 components. No exceptions.

## Banned Output Patterns

The following patterns are hard failures. Never produce them:

**In code blocks:** `// ...`, `// rest of code`, `// implement here`, `// TODO`, `/* ... */`, `// similar to above`, `// continue pattern`, `// add more as needed`, bare `...` standing in for omitted code

**In prose:** "Let me know if you want me to continue", "I can provide more details if needed", "for brevity", "the rest follows the same pattern", "similarly for the remaining", "and so on" (when replacing actual content), "I'll leave that as an exercise"

**Structural shortcuts:** Outputting a skeleton when the 请求 was for a full implementation. Showing the first and last section while skipping the middle. Replacing repeated logic with one example and a description. Describing what code should do instead of writing it.

## Execution Process

1. **Scope** — Read the full 请求. Count how many distinct deliverables are expected (files, functions, sections, answers). Lock that number.
2. **Build** — Generate every deliverable completely. No partial drafts, no "you can extend this later."
3. **Cross-check** — Before output, re-read the original 请求. Compare your deliverable count against the scope count. If anything is missing, add it before responding.

## Handling Long Outputs

When a 响应 approaches the 令牌 limit:

- Do not compress remaining sections to squeeze them in.
- Do not skip ahead to a conclusion.
- Write at full quality up to a clean breakpoint (end of a function, end of a file, end of a section).
- End with:

```
[PAUSED — X of Y complete. Send "continue" to resume from: next section name]
```

On "continue", pick up exactly where you stopped. No recap, no repetition.

## Quick Check

Before finalizing any 响应, verify:
- No banned patterns from the list above appear anywhere in the output
- Every item the user requested is present and finished
- Code blocks contain actual runnable code, not descriptions of what code would do
- Nothing was shortened to save space
