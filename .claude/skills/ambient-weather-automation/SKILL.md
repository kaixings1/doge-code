---
name: ambient-weather-自动化
description: "通过 Rube MCP (Composio) 自动化 Ambient Weather 操作。始终先调用 RUBE_SEARCH_TOOLS 获取最新工具架构。"
requires:
  mcp: [rube]
---

# 通过 Rube MCP 实现 Ambient Weather 自动化

通过 Rube MCP 使用 Composio 的 Ambient Weather 工具包自动化 Ambient Weather 操作。

**Toolkit docs**: [composio.dev/toolkits/ambient_weather](https://composio.dev/toolkits/ambient_weather)

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Ambient Weather connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `ambient_weather`
- 始终 call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client configuration. No API keys needed — just add the endpoint and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `ambient_weather`
3. If connection is not ACTIVE, follow the returned auth link to complete setup
4. Confirm connection status shows ACTIVE before running any workflows

## 工具发现

始终 discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Ambient Weather operations", known_fields: ""}]
session: {generate_id: true}
```

This returns available tool slugs, input schemas, recommended execution plans, and known pitfalls.

## 核心工作流模式

### 步骤 1: Discover Available Tools

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Ambient Weather task"}]
session: {id: "existing_session_id"}
```

### 步骤 2: Check Connection

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["ambient_weather"]
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