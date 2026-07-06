---
name: onesignal_rest_api-automation
description: "通过 Rube MCP (Composio) 自动执行 OneSignal 任务：推送通知、细分、模板和消息。使用前始终先搜索工具以获取当前 架构。"
requires:
  mcp: [rube]
---

# OneSignal 自动化

通过 Rube MCP 使用 Composio 的 OneSignal 工具包自动化 OneSignal 操作。

**工具包文档**: [composio.dev/toolkits/onesignal_rest_api](https://composio.dev/toolkits/onesignal_rest_api)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 OneSignal 连接，工具包为 `onesignal_rest_api`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 架构

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client 配置. No API keys needed — just add the 端点 and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `onesignal_rest_api`
3. If connection is not ACTIVE, follow the returned auth link to complete 设置
4. Confirm connection status shows ACTIVE before running any workflows

## 工具发现

始终 discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "push notifications, segments, templates, and messaging", "known_fields": ""}]
```

This returns:
- Available tool slugs for OneSignal
- Recommended execution plan steps
- 已知陷阱 and edge cases
- Input schemas for each tool

## 核心工作流

### 1. Discover Available OneSignal Tools

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "list all available OneSignal tools and 能力"
```

Review the returned tools, their descriptions, and input schemas before proceeding.

### 2. Execute OneSignal Operations

After discovering tools, execute them via:

```
RUBE_MULTI_EXECUTE_TOOL:
  tools:
    - tool_slug: "<discovered_tool_slug>"
      arguments: {<架构-compliant arguments>}
  memory: {}
  sync_response_to_workbench: false
```

### 3. Multi-Step Workflows

For complex workflows involving multiple OneSignal operations:

1. Search for all relevant tools: `RUBE_SEARCH_TOOLS` with specific use case
2. Execute prerequisite steps first (e.g., fetch before update)
3. Pass data between steps using tool responses
4. Use `RUBE_REMOTE_WORKBENCH` for bulk operations or data processing

## 常见模式

### Search Before Action
始终 search for existing resources before creating new ones to avoid duplicates.

### Pagination
Many list operations support pagination. Check responses for `next_cursor` or `page_token` and continue fetching until exhausted.

### Error Handling
- Check tool responses for errors before proceeding
- If a tool fails, verify the connection is still ACTIVE
- Re-authenticate via `RUBE_MANAGE_CONNECTIONS` if connection expired

### Batch Operations
For bulk operations, use `RUBE_REMOTE_WORKBENCH` with `run_composio_tool()` in a loop with `ThreadPoolExecutor` for parallel execution.

## 已知陷阱

- **始终 search tools first**: Tool schemas and available operations may change. 绝不 hardcode tool slugs without first discovering them via `RUBE_SEARCH_TOOLS`.
- **Check connection status**: Ensure the OneSignal connection is ACTIVE before executing any tools. Expired OAuth tokens require re-认证.
- **Respect rate limits**: If you receive rate limit errors, reduce 请求 frequency and implement backoff.
- **Validate schemas**: 始终 pass strictly 架构-compliant arguments. Use `RUBE_GET_TOOL_SCHEMAS` to load full input schemas when `schemaRef` is returned instead of `input_schema`.

## 快速参考

| 操作 | 方法 |
|-----------|----------|
| Find tools | `RUBE_SEARCH_TOOLS` with OneSignal-specific use case |
| Connect | `RUBE_MANAGE_CONNECTIONS` with toolkit `onesignal_rest_api` |
| Execute | `RUBE_MULTI_EXECUTE_TOOL` with discovered tool slugs |
| Bulk ops | `RUBE_REMOTE_WORKBENCH` with `run_composio_tool()` |
| Full 架构 | `RUBE_GET_TOOL_SCHEMAS` for tools with `schemaRef` |

> **Toolkit docs**: [composio.dev/toolkits/onesignal_rest_api](https://composio.dev/toolkits/onesignal_rest_api)
