---
name: 工作流技能设计
description: 教授构建基于工作流的技能的设计模式，并提供审查代理来审计现有技能。
---

# 工作流技能设计

A Claude Code plugin that teaches design patterns for building 工作流-based skills and provides a review agent for auditing existing skills.

## Components

### Skills

- **designing-工作流-skills** — Guides the design and structuring of 工作流-based Claude Code skills with multi-step phases, decision trees, subagent delegation, and progressive disclosure.

### Agents

- **工作流-skill-reviewer** — Reviews 工作流-based skills for structural quality, pattern adherence, tool assignment correctness, and anti-pattern detection. Produces a graded audit report.

## What This Plugin Teaches

Five 工作流 patterns for structuring skills:

| Pattern | Use When |