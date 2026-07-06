---
name: agenttrace-会话-audit
description: "使用 agenttrace 审计本地 AI 编码代理会话，检查成本、工具故障、延迟、异常、健康状况、差异和 CI 门。"
category: development
risk: safe
source: community
source_repo: luoyuctl/agenttrace
source_type: community
date_added: "2026-05-10"
author: luoyuctl
tags: [ai-coding, observability, cost-tracking, 会话-analysis]
tools: [claude, 游标, gemini, codex-cli]
license: "MIT"
license_source: "https://github.com/luoyuctl/agenttrace/blob/master/LICENSE"
---

# agenttrace 会话 Audit

## 概述

使用此技能检查本地 AI 编码代理会话，使用
[agenttrace](https://github.com/luoyuctl/agenttrace)。它关注运行背后的过程：令牌和成本峰值、工具失败、重试循环、延迟差距、
anomalies, health scores, and 会话-to-会话 diffs.

agenttrace is local-first and reads 会话 logs from tools such as Claude Code,
Codex CLI, Gemini CLI, Aider, 游标 exports, OpenCode, Qwen Code, Kimi, and
generic JSON or JSONL traces.

## 使用场景 This Skill

- Use when a user asks why an AI coding run was slow, expensive, shallow, or unreliable.
- Use when reviewing local agent logs before retrying a failed or suspicious task.
- Use when building a lightweight CI health gate for AI-assisted coding sessions.
- Use when comparing two attempts and looking for changed tool paths, retries, or cost patterns.

## 工作原理

### 步骤 1: Discover Available Sessions

Prefer an installed `agenttrace` binary when it is available on `PATH`. If the
current repository is `luoyuctl/agenttrace`, use `go run ./cmd/agenttrace`
instead.

```bash
agenttrace --doctor
agenttrace --overview
```

If no sessions are detected, report the directories checked by `--doctor` and
ask for the exported 会话 file or log directory.

### 步骤 2: Produce a Human-Readable Audit

Use Markdown when the user wants a concise report they can inspect or share.

```bash
agenttrace --overview -f markdown -o agenttrace-overview.md
```

In the report, lead with the highest-risk sessions and explain why they matter:
critical anomalies, repeated tool failures, 令牌 or cost waste, long latency
gaps, low health scores, and suspiciously shallow sessions.

### 步骤 3: Inspect One 会话 or Directory

Use the latest 会话 for a quick check, or pass an explicit export path when
the user provides one.

```bash
agenttrace --latest
agenttrace --latest -f json
agenttrace path/to/会话-or-export.json
agenttrace --overview -d path/to/会话-dir
```

### 步骤 4: Compare Attempts When Semantics Matter

令牌 and latency metrics can look healthy even when an agent confidently takes
the wrong implementation path. When the risk is semantic drift, pair the trace
audit with a diff against a previous or known-good attempt.

Look for:

- changed files or commands that diverge from the intended task
- missing tests or verification steps compared with the reference attempt
- repeated edits around the same files without a clear reason
- lower cost that came from skipping necessary exploration

### 步骤 5: Add Automation Gates

For CI or repeatable team workflows, use JSON output or health thresholds.

```bash
agenttrace --overview -f json -o agenttrace-overview.json
agenttrace --overview --fail-under-health 80 --fail-on-critical --max-tool-fail-rate 15
```

Tune thresholds to the project. A strict gate is useful for critical workflows;
a reporting-only command is better while the team is learning its baseline.

## 示例

### Quick Local Review

```bash
agenttrace --overview
agenttrace --latest
```

Use this after a long coding-agent run to decide whether the next prompt should
split the task, avoid a failing tool path, add missing tests, or reset context.

### CI Health Check

```bash
agenttrace --overview --fail-under-health 80 --fail-on-critical
```

Use this when agent 会话 logs are available in CI and the team wants a simple
guard against critical anomalies or unhealthy runs.

## 最佳实践

- Start with `--doctor` when 会话 discovery is uncertain.
- Report missing fields plainly; do not invent cost, model, latency, or health data.
- Treat prompts, code, and 会话 contents as private local data.
- Prefer JSON output for automation and Markdown output for human review.
- Use trace metrics for process failures and diff/reference review for semantic drift.

## 局限性

- agenttrace can only analyze logs that are present locally or provided as exports.
- Some agents do not expose enough fields to infer cost, model, cache use, or latency.
- Healthy trace metrics do not prove the final code is correct; still run tests and review diffs.
- CI gates should start as advisory until the team understands normal baseline behavior.

## Security & Safety Notes

- Do not upload private 会话 logs to external services unless the user explicitly approves it.
- Do not overwrite user reports unless they requested that exact output path.
- Avoid printing secrets found in prompts, tool output, environment variables, or logs.

## 常见陷阱

- **Problem:** No sessions are found.
  **Solution:** Run `agenttrace --doctor`, then point agenttrace at the exported file or log directory.

- **Problem:** A run looks cheap and fast but produced the wrong refactor.
  **Solution:** Compare the 会话 against a prior attempt or known-good diff; cost metrics alone will miss semantic drift.

- **Problem:** CI fails too often after adding a health gate.
  **Solution:** Start with JSON or Markdown reporting, inspect normal baselines, then tighten thresholds gradually.

## 相关技能

- `@langfuse` - Use for production LLM application tracing and evaluation.
- `@observability-engineer` - Use for broader service monitoring, SLOs, and incident workflows.
