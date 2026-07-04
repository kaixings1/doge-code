---
name: remember
description: "Remember — Remember 相关功能和最佳实践"
---

# Remember

使用此技能当 the user wants to preserve or organize useful knowledge discovered during a session.

## Goal
Promote durable, reusable knowledge into the right memory surface instead of leaving it buried in chat history.

## Memory surfaces
- **Project memory** — durable team/project knowledge
- **Notepad priority** — short high-signal context for the next turns
- **Notepad working** — temporary active-session notes
- **Docs / AGENTS / CLAUDE files** — durable instructions and conventions when they truly belong there

## 工作流
1. Gather the relevant session findings.
2. Classify each item:
   - durable project fact
   - temporary working note
   - operator preference or instruction
   - duplicate / stale / conflicting information
3. Propose the best destination for each item.
4. Write or update only the appropriate memory surface.
5. Call out duplicates or conflicts that should be cleaned up.

## Rules
- Do not dump everything into one store.
- 优先 project memory for durable team knowledge.
- 优先 notepad for short-lived working context.
- Keep entries concise and actionable.
- If something is uncertain, mark it as uncertain rather than storing it as fact.

## 输出
- What was stored
- Where it was stored
- Any duplicates/conflicts found

