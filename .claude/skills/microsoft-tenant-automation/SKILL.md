---
name: microsoft-tenant-automation
description: "通过 Rube MCP (Composio) 自动执行 Microsoft Tenant 任务。使用前始终先搜索工具以获取当前 schema。""
requires:
  mcp: [rube]
---

# Microsoft Tenant 自动化（通过 Rube MCP）

Automate Microsoft Tenant operations through Composio's Microsoft Tenant toolkit via Rube MCP.

**Toolkit docs**: [composio.dev/toolkits/microsoft_tenant](https://composio.dev/toolkits/microsoft_tenant)

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Microsoft Tenant connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `microsoft_tenant`
- 始终 call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client configuration. No API keys needed — just add the endpoint and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `microsoft_tenant`
3. If connection is not ACTIVE, follow the returned auth link to complete setup
4. Confirm connection status shows ACTIVE before running any workflows

## 工具发现

始终 discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Microsoft Tenant operations", known_fields: ""}]
session: {generate_id: true}
```

This returns available tool slugs, input schemas, recommended execution plans, and known pitfalls.

## 核心工作流模式

### 步骤 1: Discover Available Tools

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Microsoft Tenant task"}]
session: {id: "existing_session_id"}
```

### 步骤 2: Check Connection

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["microsoft_tenant"]
session_id: "your_session_id"
```

### 步骤 3: Execute Tools

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* schema-compliant args from search results */}
}]
memory: {}
session_id: "your_session_id"
```

## 已知陷阱

- **始终 search first**: Tool schemas change. 绝不 hardcode tool slugs or arguments without calling `RUBE_SEARCH_TOOLS`
- **检查连接**: Verify `RUBE_MANAGE_CONNECTIONS` shows ACTIVE status before executing tools
- **Schema 合规**: Use exact field names and types from the search results
- **Memory 参数**: 始终 include `memory` in `RUBE_MULTI_EXECUTE_TOOL` calls, even if empty (`{}`)
- **会话复用**: Reuse session IDs within a workflow. Generate new ones for new workflows
- **分页**: Check responses for pagination tokens and continue fetching until complete

## 快速参考

| Operation | Approach |