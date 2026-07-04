---
name: skillify
aliases: [learner]
description: "Skillify — Skillify 相关功能和最佳实践"
---

# Skillify

Use this skill when the current session uncovered a repeatable workflow that should become a reusable OMC skill.

> Compatibility: `/oh-my-claudecode:learner` is a deprecated alias for this skill. Prefer `/oh-my-claudecode:skillify` in docs, prompts, and new workflows. Internal implementation modules may still use the learner name.

## Goal
Capture a successful multi-step workflow as a concrete skill draft instead of rediscovering it later.

## Quality Gate
Before extracting a skill, all three should be true:
- "Could someone Google this in 5 minutes?" → No.
- "Is this specific to this codebase, project, or workflow?" → Yes.
- "Did this take real debugging, design, or operational effort to discover?" → Yes.

Prefer skills that encode decision-making heuristics, constraints, pitfalls, and verification steps. Avoid generic snippets, boilerplate, or library usage examples that belong in normal documentation.

## 工作流
1. Identify the repeatable task the session accomplished.
2. Extract:
   - inputs
   - ordered steps
   - success criteria
   - constraints / pitfalls
   - verification evidence
   - best target location for the skill
3. Decide whether the workflow belongs as:
   - a repo built-in skill
   - a user/project learned skill
   - documentation only
4. When drafting a learned skill file, output a complete skill file that starts with YAML frontmatter.
   - Never emit plain markdown-only skill files.
   - Do **not** write plain markdown without frontmatter.
   - Minimum frontmatter:
     ```yaml
     ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 00 MINUTES 46 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE