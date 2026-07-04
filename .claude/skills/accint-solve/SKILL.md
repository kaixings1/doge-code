---
name: accint-solve
description: "通过 AccInt 的 MCP 记忆循环路由代理工作：检索之前的结果、解析框架、用证据关闭承诺。"
category: ai-agents
risk: safe
source: community
source_repo: maxbaluev/accreted-intelligence
source_type: community
date_added: "2026-06-15"
author: maxbaluev
tags: [mcp, memory, ai-agents, coding-agents, workflow]
tools: [claude, codex, cursor, gemini, opencode]
license: "Apache-2.0"
license_source: "https://github.com/maxbaluev/accreted-intelligence/blob/main/LICENSE-APACHE-2.0.txt"
---

# AccInt Solve

## 概述

AccInt 是一个面向编程代理的本地优先 MCP 记忆服务器。它保留评分记录，
包括检索到的经验、未完成的承诺、延续帧和结果反馈，以便下一次代理运行能够
基于实际有效的方法继续构建。

当 AccInt 已在主机上配置为 MCP 服务器时使用此技能。
该技能将 AccInt 公开的 `solve` Claude 技能适配为主机无关的工作流，
适用于 Claude Code、Codex CLI、Cursor、Gemini CLI、OpenCode 及其他
能够调用 MCP 工具的代理运行时。

## 何时使用此技能

- 在开始非平凡的编程代理工作时使用，当先前的决策、调试历史、仓库特定习惯
  或维护者反馈可能重要时。
- 在任务可能需要多次尝试且你希望获得一个可后续接收真实结果的明确承诺 ID 时使用。
- 当 AccInt 返回延续帧且代理必须在向记忆循环提交提案之前在本地推理时使用。
- 在验证、合并、部署、维护者响应或其他现实信号之后，以诚实的结果关闭承诺时使用。
- 当主机没有配置 AccInt MCP 工具时不要使用；首先安装或配置 AccInt，
  然后重新运行工作流。

## 工作原理

### 步骤 1：确认 AccInt MCP 工具存在

使用主机可用的 MCP/工具列表确认 AccInt 服务器暴露了两个动词：

```text
acc_retrieve(query)
acc_act(runtime, input)
```

如果主机使用命名空间前缀命名工具，请使用等效的 AccInt MCP 动词。
如果这两个动词都不可用，停下来请用户配置 AccInt，不要编造记忆结果。

### 步骤 2：在规划前先检索

Before a non-trivial step, retrieve relevant prior work:

```json
{"query": "the concrete task or subtask you are about to perform"}
```

阅读返回的记忆并引用你实际构建的 `[ids]`。将检索到的记忆视为要考虑的证据，
而不是检查当前仓库、运行测试或检查实时外部状态的替代品。

### 步骤 3：通过 `solve` 路由目标

为具体目标打开 AccInt 承诺：

```json
{"runtime": "solve", "input": "要完成的具体目标"}
```

如果响应是最终结果，使用答案、承诺 ID 和引用的记忆 ID。
如果响应是 `brain_frame`，在当前会话中保留推理：
检查帧，从工作区解决缺失的判断或知识，
然后通过 `continue` 提交简洁的提案。

### 步骤 4：解决延续帧

对于返回的帧，除非主机明确为你管理 tokens，
否则只提交帧 ID 和你的提案文本：

```json
{
  "runtime": "continue",
  "input": {
    "frame_id": "bf_...",
    "proposal_text": "基于当前证据的合理答案、计划或决策"
  }
}
```

不要让接收到的帧保持未解决状态。如果帧过期，关闭或重新运行绑定的承诺，
而不是假装延续成功。

### 步骤 5：在 AccInt 之外执行和验证

在仓库、浏览器、shell、问题跟踪器或其他真实环境中进行实际工作。
使用可用的最强相关证据进行验证：测试、构建、linter、链接检查、
PR 状态、截图、维护者回复或生产遥测数据。

AccInt 存储学习循环；它不会取代工作或证据。

### 步骤 6：以结果关闭承诺

当现实给出答案时，记录结果：

```json
{
  "runtime": "outcome",
  "input": {
    "ref": "solved:...",
    "good": true,
    "note": "简要证据：测试通过、PR 合并、部署成功、审阅者接受，或确切失败原因"
  }
}
```

Use `good: false` when the approach failed. Do not tag an outcome as external
or owner-validated unless a real external system or the owner actually supplied
that verdict.

## 示例

### Example 1: Start a repository fix with memory

```text
1. acc_retrieve({"query":"fix failing parser tests in this repo"})
2. Read the returned memories; cite only the relevant [ids].
3. acc_act(runtime="solve", input="Fix the failing parser tests and verify them")
4. Inspect the repo, edit files, run the parser tests.
5. acc_act(runtime="outcome", input={"ref":"solved:...", "good":true, "note":"parser test command passed"})
```

### Example 2: Handle a continuation frame

```text
AccInt returns frame bf_123 asking for a judgment about whether to patch the
schema or the caller.

1. Inspect the schema and caller in the current repo.
2. Decide from code evidence, not memory alone.
3. acc_act(runtime="continue", input={"frame_id":"bf_123", "proposal_text":"Patch the caller because..."})
4. Continue implementation and verification.
```

## 最佳实践

- Cite retrieved `[ids]` whenever they shape your plan or answer.
- Keep owner-held facts owner-held: ask instead of fabricating preferences,
  credentials, identity, or history the repository cannot prove.
- Use small, concrete solve goals; open a new solve for materially different
  subproblems instead of overloading one commitment.
- Close commitments promptly when reality answers, including failures.
- Record evidence in outcome notes, not confidence.
- Preserve privacy: do not store secrets, raw credentials, or unnecessary
  sensitive user data in outcome notes.

## 局限性

- 需要 an installed and configured AccInt MCP server exposing
  `acc_retrieve` and `acc_act`.
- Does not replace repository inspection, tests, review, or live-state checks.
- Retrieved memory can be stale or wrong; current evidence wins.
- Outcome credit is only as strong as the evidence tier. Self-graded outcomes
  are weaker than runtime, external, or owner-validated outcomes.
- AccInt is local-first; a different machine or database may not have the same
  memories unless the user intentionally shares the AccInt database.

## 安全性 & Safety Notes

- This skill does not require shell commands, network fetches, or credentials.
- AccInt MCP calls can write to the configured local AccInt database by opening
  commitments, continuations, and outcomes. Treat those writes as project
  memory, and avoid recording sensitive data that does not need to persist.
- If a task involves production systems, payments, private accounts, legal or
  medical facts, or secrets, get the required authorization and verify against
  the appropriate external source before recording an outcome.

## 常见陷阱

- **Problem:** Using retrieved memory as if it were guaranteed current.
  **Solution:** Use it to guide investigation, then verify in the current
  workspace or live system.
- **Problem:** Leaving a `brain_frame` open because implementation work started.
  **Solution:** Submit a `continue` proposal first, or close/rerun the bound
  commitment if the frame expires.
- **Problem:** Marking an outcome good before tests, checks, or external state
  prove it.
  **Solution:** Wait for real evidence, then record the outcome with the exact
  command, PR state, deploy state, or reviewer signal.

## 相关 Skills

- `@agent-memory-mcp` - Use when you need a broader overview of MCP-backed
  agent memory systems.
- `@verification-before-completion` - Use before claiming work is complete.
- `@lint-and-validate` - Use to select and run repository validation commands.
