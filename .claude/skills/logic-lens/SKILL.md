---
name: logic-lens
description: "AI 驱动的 Claude Code 技能，使用形式逻辑和推理框架执行深度代码审查，检测超越 linter 能力的 bug、反模式和安全风险。"
category: development
risk: safe
source: community
source_repo: hyhmrright/logic-lens
source_type: community
license: "MIT"
license_source: "https://github.com/hyhmrright/logic-lens/blob/main/LICENSE"
date_added: "2026-04-29"
author: hyhmrright
tags: [code-review, logic-analysis, debugging, security-review, claude-code]
tools: [claude, codex, cursor, gemini]
---

# Logic Lens

## 概述

Logic Lens 是一个 Claude Code 技能，使用形式化推理框架执行深度、逻辑驱动的代码审查。不同于 traditional linters that check syntax and style, Logic Lens analyzes your code for logical errors, race conditions, security vulnerabilities, type mismatches, and algorithmic flaws that only appear when you reason through the code's behavior.

Powered by structured AI analysis, Logic Lens applies systematic logical inspection across 9 risk categories: null/undefined handling, type safety, concurrency, resource management, security injection, boundary conditions, algorithm correctness, state management, and API contract violations.

## When to Use This Skill

- Use when you want a thorough logic review before merging a PR
- Use when a bug seems hard to find and standard linters aren't helping
- Use when reviewing security-sensitive code paths (auth, payments, file access)
- Use when refactoring complex business logic
- Use when onboarding to a new codebase and need to understand risk areas

## 工作原理

Logic Lens uses Claude Code's reasoning capabilities to:

1. Parse code structure and build a mental model of data flow
2. Apply formal logic checks across 9 risk categories
3. Trace execution paths for edge cases and boundary conditions
4. Identify security anti-patterns (injection, privilege escalation, data leakage)
5. Report findings with severity levels and actionable fix suggestions

## 安装

```bash
# Install via Claude Code plugin marketplace
# Search: "logic-lens" in Claude Code > Extensions

# Or install via NPX (Antigravity)
npx antigravity-awesome-skills --claude
# Then invoke: @logic-lens
```

## 示例

### 示例 1: Review a Single File

```
@logic-lens review src/auth/login.ts for security issues
```

**Logic Lens output:**
```
[CRITICAL] SQL Injection risk at line 42: user input concatenated into query string
[HIGH] Missing rate limiting on login attempts
[MEDIUM] Password comparison uses == instead of timing-safe comparison
[LOW] Error messages may leak valid usernames (user enumeration)
```

### 示例 2: Full Repository Scan

```
@logic-lens scan the entire codebase and prioritize by severity
```

### Example 3: Pre-PR Review

```
@logic-lens review all files changed in this branch before I open a PR
```

## The 9 Risk Categories

| Category | What It Checks |