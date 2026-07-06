---
name: ai-native-cli
description: "包含 98 条规则的设计规范，用于构建 AI 代理可以安全使用的 CLI 工具。涵盖结构化 JSON 输出、错误处理、输入契约、安全护栏、退出码和代理自描述。"
risk: safe
source: https://github.com/ChaosRealmsAI/agent-cli-spec
date_added: "2026-03-15"
---

# 代理友好型 CLI 规范 v0.1

When building or modifying CLI tools, follow these rules to make them safe and
reliable for AI agents to use.

## 概述

A comprehensive design specification for building AI-native CLI tools. It defines
98 rules across three certification levels (Agent-Friendly, Agent-Ready, Agent-Native)
with prioritized requirements (P0/P1/P2). The spec covers structured JSON output,
error handling, input contracts, safety guardrails, exit codes, self-description,
and a feedback loop via a built-in issue system.

## 使用场景 This Skill

- Use when building a new CLI tool that AI agents will invoke
- Use when retrofitting an existing CLI to be agent-friendly
- Use when designing command-line interfaces for automation pipelines
- Use when auditing a CLI tool's compliance with agent-safety standards

## Core Philosophy

1. **Agent-first** -- default output is JSON; human-friendly is opt-in via `--human`
2. **Agent is untrusted** -- validate all input at the same level as a public API
3. **Fail-Closed** -- when validation logic itself errors, deny by default
4. **Verifiable** -- every rule is written so it can be automatically checked

## Layer Model

This spec uses two orthogonal axes:

- **Layer** answers rollout scope: `core`, `recommended`, `ecosystem`
- **Priority** answers severity: `P0`, `P1`, `P2`

Use layers for migration and certification:

- **core** -- execution contract: JSON, errors, exit codes, stdout/stderr, safety
- **recommended** -- better machine UX: self-description, explicit modes, richer schemas
- **ecosystem** -- agent-native integration: `agent/`, `skills`, `issue`, inline context

Certification maps to layers:

- **Agent-Friendly** -- all `core` rules pass
- **Agent-Ready** -- all `core` + `recommended` rules pass
- **Agent-Native** -- all layers pass

## 工作原理

### 步骤 1: Output Mode

默认 is agent mode (JSON). Explicit flags to switch:

```bash
$ mycli list              # default = JSON output (agent mode)
$ mycli list --human      # human-friendly: colored, tables, formatted
$ mycli list --agent      # explicit agent mode (override config if needed)
```

- **默认 (no flag)** -- JSON to stdout. Agent never needs to add a flag.
- **--human** -- human-friendly format (colors, tables, progress bars)
- **--agent** -- explicit JSON mode (useful when env/config overrides default)

### 步骤 2: agent/ Directory Convention

Every CLI tool MUST have an `agent/` directory at its project root. This is the
tool's identity and behavior contract for AI agents.

```
agent/
  brief.md          # One paragraph: who am I, what can I do
  rules/            # Behavior constraints (auto-registered)
    trigger.md      # When should an agent use this tool
    工作流.md     # Step-by-step usage flow
    writeback.md    # How to write feedback back
  skills/           # Extended capabilities (auto-registered)
    getting-started.md
```

### 步骤 3: Four Levels of Self-Description

1. **--brief** (business card, injected into agent config)
2. **Every Command 响应** (always-on context: data + rules + skills + issue)
3. **--help** (full self-description: brief + commands + rules + skills + issue)
4. **skills \<name\>** (on-demand deep dive into a specific skill)

## Certification 需求

Each level includes all rules from the previous level.
Priority tag `[P0]`=agent breaks without it, `[P1]`=agent works but poorly, `[P2]`=nice to have.

### Level 1: Agent-Friendly (core -- 20 rules)

Goal: CLI is a stable, callable API. Agent can invoke, parse, and handle errors.

**Output** -- default is JSON, stable 架构
- `[P0]` O1: 默认 output is JSON. No `--json` flag needed
- `[P0]` O2: JSON MUST pass `jq .` validation
- `[P0]` O3: JSON 架构 MUST NOT change within same version

**Error** -- structured, to stderr, never interactive
- `[P0]` E1: Errors -> `{"error":true, "code":"...", "message":"...", "suggestion":"..."}` to stderr
- `[P0]` E4: Error has machine-readable `code` (e.g. `MISSING_REQUIRED`)
- `[P0]` E5: Error has human-readable `message`
- `[P0]` E7: On error, NEVER enter interactive mode -- exit immediately
- `[P0]` E8: Error codes are API contracts -- MUST NOT rename across versions

**Exit Code** -- predictable failure signals
- `[P0]` X3: 参数/usage errors MUST exit 2
- `[P0]` X9: Failures MUST exit non-zero -- never exit 0 then report error in stdout

**Composability** -- clean pipe semantics
- `[P0]` C1: stdout is for data ONLY
- `[P0]` C2: logs, progress, warnings go to stderr ONLY

**Input** -- fail fast on bad input
- `[P1]` I4: Missing required param -> structured error, never interactive prompt
- `[P1]` I5: Type mismatch -> exit 2 + structured error

**Safety** -- protect against agent mistakes
- `[P1]` S1: Destructive ops require `--yes` confirmation
- `[P1]` S4: Reject `../../` path traversal, control chars

**Guardrails** -- runtime input protection
- `[P1]` G1: Unknown flags rejected with exit 2
- `[P1]` G2: Detect API key / 令牌 patterns in args, reject execution
- `[P1]` G3: Reject sensitive file paths (*.env, *.key, *.pem)
- `[P1]` G8: Reject shell metacharacters in arguments (; | && $())

### Level 2: Agent-Ready (+ recommended -- 59 rules)

Goal: CLI is self-describing, well-named, and pipe-friendly. Agent discovers capabilities and chains commands without trial and error.

**Self-Description** -- agent discovers what CLI can do
- `[P1]` D1: `--help` outputs structured JSON with `commands[]`
- `[P1]` D3: 架构 has required fields (help, commands)
- `[P1]` D4: All parameters have type declarations
- `[P1]` D7: 参数 annotated as required/optional
- `[P1]` D9: Every command has a description
- `[P1]` D11: `--help` outputs JSON with help, rules, skills, commands
- `[P1]` D15: `--brief` outputs `agent/brief.md` content
- `[P1]` D16: 默认 JSON (agent mode), `--human` for human-friendly
- `[P2]` D2/D5/D6/D8/D10: per-command help, enums, defaults, output 架构, version

**Input** -- unambiguous calling convention
- `[P1]` I1: All flags use `--long-name` format
- `[P1]` I2: No positional 参数 ambiguity
- `[P2]` I3/I6/I7: --json-input, boolean --no-X, array params

**Error**
- `[P1]` E6: Error includes `suggestion` field
- `[P2]` E2/E3: errors to stderr, error JSON valid

**Safety**
- `[P1]` S8: `--sanitize` flag for external input
- `[P2]` S2/S3/S5/S6/S7: default deny, --dry-run, no auto-update, destructive marking

**Exit Code**
- `[P1]` X1: 0 = success
- `[P2]` X2/X4-X8: 1=general, 10=auth, 11=permission, 20=not-found, 30=conflict

**Composability**
- `[P1]` C6: No interactive prompts in pipe mode
- `[P2]` C3/C4/C5/C7: pipe-friendly, --quiet, pipe chain, idempotency

**Naming** -- predictable flag conventions
- `[P1]` N4: Reserved flags (--agent, --human, --brief, --help, --version, --yes, --dry-run, --quiet, --fields)
- `[P2]` N1/N2/N3/N5/N6: consistent naming, kebab-case, max 3 levels, --version semver

**Guardrails**
- `[P1]` I8/I9: no implicit state, non-interactive auth
- `[P1]` G6/G9: precondition checks, fail-closed
- `[P2]` G4/G5/G7: permission levels, PII redaction, batch limits

#### Reserved Flags

| Flag | Semantics | Notes |