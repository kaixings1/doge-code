---
name: ultraqa
description: "Ultraqa — Ultraqa 相关功能和最佳实践"
argument-hint: "[--tests|--build|--lint|--typecheck|--custom <pattern>] [--interactive]"
level: 3
---

# UltraQA Skill

[ULTRAQA ACTIVATED - AUTONOMOUS QA CYCLING]

## Overview

You are now in **ULTRAQA** mode - an autonomous QA cycling workflow that runs until your quality goal is met.

**Cycle**: qa-tester → architect verification → fix → repeat

## Relationship to `/goal`, Ralph, Team, and Ultragoal

UltraQA owns repeated quality-gate cycling only. Use the deterministic conflict policies `refuse`, `adopt_existing`, and `artifact_only` rather than non-deterministic warning handling. Use it after the target behavior is known and the remaining question is whether tests, build, lint, typecheck, or another explicit QA condition passes. If Claude Code `/goal` is active, UltraQA may produce visible command evidence for that goal, but must not describe the `/goal` evaluator as independently running commands or reading files. If Ralph or Team is active, UltraQA is a verification/fix sub-loop under that authority rather than a competing session loop. If no active loop is safe, record QA expectations and evidence in artifact-only Ultragoal notes instead of claiming automatic execution.

## Goal Parsing

Parse the goal from arguments. Supported formats:

| Invocation                                     | Goal Type | What to Check                    |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 54 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE