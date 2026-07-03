---
name: tpscheck-automation
description: "通过 Rube MCP (Composio) 自动执行 Tpscheck 任务。使用前始终先搜索工具以获取当前 schema。""
requires:
  mcp: [rube]
---

# Tpscheck Automation via Rube MCP

Automate Tpscheck operations through Composio's Tpscheck toolkit via Rube MCP.

**Toolkit docs**: [composio.dev/toolkits/tpscheck](https://composio.dev/toolkits/tpscheck)

## Prerequisites

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Tpscheck connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `tpscheck`
- Always call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## Setup

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client configuration. No API keys needed — just add the endpoint and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `tpscheck`
3. If connection is not ACTIVE, follow the returned auth link to complete setup
4. Confirm connection status shows ACTIVE before running any workflows

## Tool Discovery

Always discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Tpscheck operations", known_fields: ""}]
session: {generate_id: true}
```

This returns available tool slugs, input schemas, recommended execution plans, and known pitfalls.

## Core Workflow Pattern

### Step 1: Discover Available Tools

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Tpscheck task"}]
session: {id: "existing_session_id"}
```

### Step 2: Check Connection

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["tpscheck"]
session_id: "your_session_id"
```

### Step 3: Execute Tools

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* schema-compliant args from search results */}
}]
memory: {}
session_id: "your_session_id"
```

## Known Pitfalls

- **Always search first**: Tool schemas change. Never hardcode tool slugs or arguments without calling `RUBE_SEARCH_TOOLS`
- **Check connection**: Verify `RUBE_MANAGE_CONNECTIONS` shows ACTIVE status before executing tools
- **Schema compliance**: Use exact field names and types from the search results
- **Memory parameter**: Always include `memory` in `RUBE_MULTI_EXECUTE_TOOL` calls, even if empty (`{}`)
- **Session reuse**: Reuse session IDs within a workflow. Generate new ones for new workflows
- **Pagination**: Check responses for pagination tokens and continue fetching until complete

## Quick Reference

| Operation | Approach |
|-----------|----------|
|查找工具|具有Tpscheck特定用例的“RUBE_SEARCH_TOOLS” |
|使用工具包“tpscheck”连接| “RUBE_MANAGE_CONNECTIONS” |
|使用发现的工具slug执行| “RUBE_MULTI_EXECUTE_TOOL” |
|批量操作| “RUBE_REMOTE_WORKBENCH”与“RUN_COMPOSIO_TOOL ()” |
|完整架构| “schemaRef”工具的“RUBE_GET_TOOL_SCHEMAS” |

---
*由[Composio] (https://composio.dev)提供支持*