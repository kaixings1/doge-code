---
name: oncehub-automation
description: "通过 Rube MCP (Composio) 自动执行 Oncehub 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Oncehub 自动化

通过 Rube MCP 使用 Composio 的 Oncehub 工具包自动化 Oncehub 操作。

**工具包文档**: [composio.dev/toolkits/oncehub](https://composio.dev/toolkits/oncehub)

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Oncehub connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `oncehub`
- 始终 call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client 配置. No API keys needed — just add the 端点 and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `oncehub`
3. If connection is not ACTIVE, follow the returned auth link to complete 设置
4. Confirm connection status shows ACTIVE before running any workflows

## 工具发现

始终 discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Oncehub operations", known_fields: ""}]
会话: {generate_id: true}
```

This returns available tool slugs, input schemas, recommended execution plans, and 已知陷阱.

## 核心工作流模式

### 步骤 1: Discover Available Tools

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Oncehub task"}]
会话: {id: "existing_session_id"}
```

### 步骤 2: Check Connection

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["oncehub"]
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

- **始终先搜索**: Tool schemas change. 绝不 hardcode tool slugs or arguments without calling `RUBE_SEARCH_TOOLS`
- **检查连接**: Verify `RUBE_MANAGE_CONNECTIONS` shows ACTIVE status before executing tools
- **schema 合规**: Use exact field names and types from the search results
- **Memory 参数**: 始终 include `memory` in `RUBE_MULTI_EXECUTE_TOOL` calls, even if empty (`{}`)
- **会话复用**: Reuse 会话 IDs within a 工作流. Generate new ones for new workflows
- **分页**: Check responses for pagination tokens and continue fetching until complete

## 快速参考

| 操作 | 方法 |
|-----------|----------|
| Find tools | `RUBE_SEARCH_TOOLS` with Oncehub-specific use case |
| Connect | `RUBE_MANAGE_CONNECTIONS` with toolkit `oncehub` |
| Execute | `RUBE_MULTI_EXECUTE_TOOL` with discovered tool slugs |
| Bulk ops | `RUBE_REMOTE_WORKBENCH` with `run_composio_tool()` |
| Full 架构 | `RUBE_GET_TOOL_SCHEMAS` for tools with `schemaRef` |

---
*Powered by [Composio](https://composio.dev)*
