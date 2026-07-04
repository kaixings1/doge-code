---
name: learn-rule
description: "Pro Workflow\Skills\Learn Rule — Pro Workflow\Skills\Learn Rule 相关功能和最佳实践"
---

# Learn Rule

Capture a lesson from the current session into permanent memory.

## Trigger

Use when the user says "remember this", "add to rules", "don't do that again", or after a mistake is identified.

## 工作流

1. Identify the lesson — what mistake was made? What should happen instead?
2. Format the rule with full context.
3. Propose the addition and wait for user approval.
4. After approval, persist to LEARNED section or project memory.

## Format

```
[LEARN] Category: One-line rule
Mistake: What went wrong
Correction: How it was fixed
```

### Wiki-scoped rules

Append `Wiki: <slug>` to bind the rule to a single pro-workflow wiki. The rule loads only when that wiki is in scope, avoiding cross-project pollution:

```
[LEARN] Editing: Cite a sources.md row before adding any wiki claim.
Wiki: agent-memory
```

The capture hook auto-detects `Wiki: <slug>` and links the learning to that wiki via `learnings_wiki`.

## Categories

| Category | Examples |
|----------|---------|
| Navigation | File paths, finding code, wrong file edited |
| Editing | Code changes, patterns, wrong approach |
| Testing | Test approaches, coverage gaps, flaky tests |
| Git | Commits, branches, merge issues |
| Quality | Lint, types, style violations |
| Context | When to clarify, missing requirements |
| Architecture | Design decisions, wrong abstractions |
| Performance | Optimization, O(n^2) loops, memory |

## 示例

```
Recent mistake: Edited wrong utils.ts file

[LEARN] Navigation: Confirm full path when multiple files share a name.

Add to LEARNED section? (y/n)
```

## Guardrails

- Always wait for user approval before persisting.
- Keep rules to one line — specific and actionable.
- Bad: "Write good code". Good: "Always use snake_case for database columns".
- Include the mistake context so the rule makes sense later.

## 输出

- The proposed `[LEARN]` rule with category
- Confirmation after persisting
