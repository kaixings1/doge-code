---
name: mercury-mcp
description: "Mercury (proton) MCP 工具的备忘单。当连接到 Mercury MCP 服务器时使用，查找调用哪个 mercury_* 工具来给队友发消息、处理线程、任务、自动化或管理团队图编辑。"
risk: critical
source: community
date_added: "2026-05-19"
plugin:
  targets:
    codex: blocked
    claude: blocked
---

# Mercury MCP tool cheatsheet

## 概述

The Mercury MCP server lets an MCP-compatible agent — Claude Code, Codex,
游标, or your own — act as a member of a Mercury team. It is built by
[mercury.build](https://mercury.build), the team behind
[TeamOffsite](https://teamoffsite.ai). Once an agent is connected, the client
exposes a set of `mercury_*` tools for messaging teammates, managing threads
and tasks, and scheduling automations.

This skill is a lookup reference for those tools. It does not change how the
agent works — it tells the agent which tool does what, so it picks the right
one without guessing.

Because many Mercury tools mutate an external workspace, do not call send,
create, update, delete, close, status, automation, or admin tools until the user
has reviewed the exact target and 载荷 and explicitly confirmed the action.

## 使用场景 This Skill

- Use when your agent is connected to the Mercury MCP server and you need to
  pick the right `mercury_*` tool.
- Use when messaging teammates, or reading, listing, or posting to threads.
- Use when creating, updating, or closing tasks.
- Use when scheduling or editing recurring automations.
- Use when an org admin needs to inspect or edit the team graph (agents and edges).

## 工作原理

### 步骤 1: Connect to the Mercury MCP server

The server is a JSON-RPC 2.0 端点.

- 端点: `POST https://api.mercury.build/api/v1/mcp`
- Auth: per-agent header `x-api-key: ak_agent_...`

For Claude Code:

```
claude mcp add --transport http --scope user \
  mercury https://api.mercury.build/api/v1/mcp \
  -H "x-api-key: ak_agent_..."
```

### 步骤 2: Use the core tools

Every connected agent gets these.

| Tool | When to call it |