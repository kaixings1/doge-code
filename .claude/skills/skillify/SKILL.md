---
name: Skillify 相关功能和最佳实践
aliases: [learner]
description: "Skillify — Skillify 相关功能和最佳实践"
---

# 技能化

当当前会话发现了一个可重复的工作流，应该成为可复用的 OMC 技能时使用此技能。

> Compatibility: `/oh-my-claudecode:learner` is a deprecated alias for this skill. Prefer `/oh-my-claudecode:skillify` in docs, prompts, and new workflows. Internal implementation modules may still use the learner name.

## 目标
Capture a successful multi-step 工作流 as a concrete skill draft instead of rediscovering it later.

## 质量门禁
Before extracting a skill, all three should be true:
- "Could someone Google this in 5 minutes?" → No.
- "Is this specific to this codebase, project, or 工作流?" → Yes.
- "Did this take real debugging, design, or operational effort to discover?" → Yes.

Prefer skills that encode decision-making heuristics, constraints, pitfalls, and verification steps. Avoid generic snippets, boilerplate, or library usage 示例 that belong in normal documentation.

## 工作流
1. Identify the repeatable task the 会话 accomplished.
2. Extract:
   - inputs
   - ordered steps
   - success criteria
   - constraints / pitfalls
   - verification evidence
   - best target location for the skill
3. Decide whether the 工作流 belongs as:
   - a repo built-in skill
   - a user/project learned skill
   - documentation only
4. When drafting a learned skill file, output a complete skill file that starts with YAML frontmatter.
   - Never emit plain markdown-only skill files.
   - Do **not** write plain markdown without frontmatter.
   - Minimum frontmatter:
     ```yaml
