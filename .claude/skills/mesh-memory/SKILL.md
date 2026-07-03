---
name: mesh-memory
description: "通过 MCP 实现 AI 代理的自托管语义记忆。保存工作日志、决策和笔记，然后跨会话按含义而非关键词回忆。Postgres + pgvector 并带自动标签。"
risk: safe
source: dklymentiev/mesh-memory (MIT)
date_added: "2026-05-23"
---

# Mesh Memory

Mesh Memory is a self-hosted semantic memory service with a built-in MCP server. It stores documents (worklogs, decisions, notes, research) in PostgreSQL with pgvector and retrieves them by meaning, so a query like "what database did we pick?" surfaces a saved note that says "chose Redis for caching" even with zero keyword overlap. Embeddings are generated locally with `multilingual-e5-base` (768 dimensions); the core flow requires no external API keys.

Use this skill when an agent needs persistent memory across sessions: saving its own work, recalling prior decisions, or building a project knowledge base shared between multiple agents.

## When to Use This Skill

- Saving a session worklog, decision, or research note so a later session can find it.
- Recalling past work by topic when you do not remember the exact words you used.
- Sharing a long-lived knowledge base across multiple agents, terminals, or teammates.
- Organizing context by role or project through workspaces (one workspace per role/project).
- Looking up structured tags (e.g. all `type:decision` entries from one project).

## Prerequisites

- A running Mesh Memory instance reachable from the MCP server. Local Docker is the common path -- `docker compose up -d` in the upstream repo brings it up; see https://github.com/dklymentiev/mesh-memory for the full Quick Start.
- The MCP server (`mcp_server.py`) registered with your client (Claude Code, Cursor, Claude Desktop, or any other MCP-aware agent).
- `MESH_API_URL` pointing at the running instance (default: `http://localhost:8000`).

## Setup

Register the MCP server in your client configuration:

```json
{
  "mcpServers": {
    "mesh": {
      "command": "python3",
      "args": ["/path/to/mesh-memory/mcp_server.py"],
      "env": {
        "MESH_API_URL": "http://localhost:8000"
      }
    }
  }
}
```

When the server is reachable, the 13 tools listed below become available.

## MCP Tools

| Tool | Purpose |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 33 MINUTES 45 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE