---
name: agent-introspection-debugging
description: AI代理故障的结构化自调试工作流
---

# Agent Introspection Debugging

使用此技能当 an agent run is failing repeatedly, consuming tokens without progress, looping on the same tools, or drifting away from the intended task.

This is a 工作流 skill, not a hidden runtime. It teaches the agent to debug itself systematically before escalating to a human.

## When to Activate

- Maximum tool call / loop-limit failures
- Repeated retries with no forward progress
- 上下文 growth or prompt drift that starts degrading output quality
- File-system or environment state mismatch between expectation and reality
- Tool failures that are likely recoverable with diagnosis and a smaller corrective action

## 范围 Boundaries

Activate this skill for:
- capturing failure state before retrying blindly
- diagnosing common agent-specific failure patterns
- applying contained recovery actions
- producing a structured human-readable debug report

Do not use this skill as the primary source for:
- feature verification after code changes; use `verification-loop`
- framework-specific debugging when a narrower ECC skill already exists
- runtime promises the current harness cannot enforce automatically

## Four-Phase Loop

### Phase 1: Failure Capture

Before trying to recover, record the failure precisely.

Capture:
- error type, message, and stack trace when available
- last meaningful tool call sequence
- what the agent was trying to do
- current context pressure: repeated prompts, oversized pasted logs, duplicated plans, or runaway notes
- current environment assumptions: cwd, branch, relevant service state, expected files

Minimum capture template:

```markdown
## Failure Capture
- 会话 / task:
- Goal in progress:
- Error:
- Last successful step:
- Last failed tool / command:
- Repeated pattern seen:
- Environment assumptions to verify:
```

### Phase 2: Root-Cause Diagnosis

Match the failure to a known pattern before changing anything.

| Pattern | Likely Cause | Check |