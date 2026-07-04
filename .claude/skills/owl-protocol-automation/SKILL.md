---
name: owl-protocol-automation
description: "通过 Rube MCP (Composio) 自动执行 Owl Protocol 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# 通过 Rube MCP 实现 Owl Protocol 自动化

通过 Rube MCP 使用 Composio 的 Owl Protocol 工具包自动化 Owl Protocol 操作。

**工具包文档**: [composio.dev/toolkits/owl_protocol](https://composio.dev/toolkits/owl_protocol)

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Owl Protocol connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `owl_protocol`
- Always call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client configuration. No API keys needed — just add the endpoint and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `owl_protocol`
3. If connection is not ACTIVE, follow the returned auth link to complete setup
4. Confirm connection status shows ACTIVE before running any workflows

## 工具发现

Always discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Owl Protocol operations", known_fields: ""}]
session: {generate_id: true}
```

This returns available tool slugs, input schemas, recommended execution plans, and known pitfalls.

## 核心工作流模式

### 步骤 1: Discover Available Tools

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Owl Protocol task"}]
session: {id: "existing_session_id"}
```

### 步骤 2: Check Connection

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["owl_protocol"]
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

- **始终先搜索**: Tool schemas change. Never hardcode tool slugs or arguments without calling `RUBE_SEARCH_TOOLS`
- **检查连接**: Verify `RUBE_MANAGE_CONNECTIONS` shows ACTIVE status before executing tools
- **Schema 合规**: Use exact field names and types from the search results
- **Memory 参数**: Always include `memory` in `RUBE_MULTI_EXECUTE_TOOL` calls, even if empty (`{}`)
- **会话复用**: Reuse session IDs within a workflow. Generate new ones for new workflows
- **分页**: Check responses for pagination tokens and continue fetching until complete

## 快速参考

| Operation | Approach |
|-----------|----------|
| Find tools | `RUBE_SEARCH_TOOLS` with Owl Protocol-specific use case |
| Connect | `RUBE_MANAGE_CONNECTIONS` with toolkit `owl_protocol` |
| Execute | `RUBE_MULTI_EXECUTE_TOOL` with discovered tool slugs |
| Bulk ops | `RUBE_REMOTE_WORKBENCH` with `run_composio_tool()` |
| Full schema | `RUBE_GET_TOOL_SCHEMAS` for tools with `schemaRef` |

---
*Powered by [Composio](https://composio.dev)*
