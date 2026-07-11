---
name: Agent 构建器
description: "Agent Builder — 设计和构建适用于任何领域的 AI 代理。当用户要求"创建代理""构建助手"或"设计 AI 系统"时使用。"
  (2) want to understand agent architecture, agentic patterns, or autonomous AI
  (3) need help with capabilities, subagents, planning, or skill mechanisms
  (4) ask about Claude Code, 游标, or similar agent internals
  (5) want to build agents for business, research, creative, or operational tasks
  Keywords: agent, assistant, autonomous, 工作流, tool use, multi-step, orchestration
---

# Agent Builder

Build AI agents for any domain - customer service, research, operations, creative work, or specialized business processes.

## The Core Philosophy

> **The model already knows how to be an agent. Your job is to get out of the way.**

An agent is not complex engineering. It's a simple loop that invites the model to act:

```
LOOP:
  Model sees: context + available capabilities
  Model decides: act or respond
  If act: execute capability, add result, continue
  If respond: return to user
```

**That's it.** The magic isn't in the code - it's in the model. Your code just provides the opportunity.

## The Three Elements

### 1. Capabilities (What can it DO?)

Atomic actions the agent can perform: search, read, create, send, 查询, modify.

**Design principle**: Start with 3-5 capabilities. Add more only when the agent consistently fails because a capability is missing.

### 2. Knowledge (What does it KNOW?)

Domain expertise injected on-demand: policies, workflows, best practices, schemas.

**Design principle**: Make knowledge available, not mandatory. Load it when relevant, not upfront.

### 3. 上下文 (What has happened?)

The conversation history - the thread connecting actions into coherent behavior.

**Design principle**: 上下文 is precious. Isolate noisy subtasks. Truncate verbose outputs. Protect clarity.

## Agent Design Thinking

Before building, understand:

- **Purpose**: What should this agent accomplish?
- **Domain**: What world does it operate in? (customer service, research, operations, creative...)
- **Capabilities**: What 3-5 actions are essential?
- **Knowledge**: What expertise does it need access to?
- **Trust**: What decisions can you delegate to the model?

**CRITICAL**: Trust the model. Don't over-engineer. Don't pre-specify workflows. Give it capabilities and let it reason.

## Progressive Complexity

Start simple. Add complexity only when real usage reveals the need:

| Level | What to add | When to add it |