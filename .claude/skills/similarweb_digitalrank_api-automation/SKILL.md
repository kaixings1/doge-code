---
name: similarweb_digitalrank_api-automation
description: "通过 Rube MCP (Composio) 自动执行 SimilarWeb 任务：website traffic, rankings, and digital market intelligence. Always search tools first for current schemas."
requires:
  mcp: [rube]
---

# SimilarWeb 自动化（通过 Rube MCP）

Automate SimilarWeb operations through Composio's SimilarWeb toolkit via Rube MCP.

**Toolkit docs**: [composio.dev/toolkits/similarweb_digitalrank_api](https://composio.dev/toolkits/similarweb_digitalrank_api)

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active SimilarWeb connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `similarweb_digitalrank_api`
- Always call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client 配置. No API keys needed — just add the 端点 and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `similarweb_digitalrank_api`
3. If connection is not ACTIVE, follow the returned auth link to complete 设置
4. Confirm connection status shows ACTIVE before running any workflows

## 工具发现

Always discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "website traffic, rankings, and digital market intelligence", "known_fields": ""}]
```

This returns:
- Available tool slugs for SimilarWeb
- Recommended execution plan steps
- 已知陷阱 and edge cases
- Input schemas for each tool

## 核心工作流

### 1. Discover Available SimilarWeb Tools

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "list all available SimilarWeb tools and 能力"
```

Review the returned tools, their descriptions, and input schemas before proceeding.

### 2. Execute SimilarWeb Operations

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

For complex workflows involving multiple SimilarWeb operations:

1. Search for all relevant tools: `RUBE_SEARCH_TOOLS` with specific use case
2. Execute prerequisite steps first (e.g., fetch before update)
3. Pass data between steps using tool responses
4. Use `RUBE_REMOTE_WORKBENCH` for bulk operations or data processing

## 常见模式

### Search Before Action
Always search for existing resources before creating new ones to avoid duplicates.

### Pagination
Many list operations support pagination. Check responses for `next_cursor` or `page_token` and continue fetching until exhausted.

### Error Handling
- Check tool responses for errors before proceeding
- If a tool fails, verify the connection is still ACTIVE
- Re-authenticate via `RUBE_MANAGE_CONNECTIONS` if connection expired

### Batch Operations
For bulk operations, use `RUBE_REMOTE_WORKBENCH` with `run_composio_tool()` in a loop with `ThreadPoolExecutor` for parallel execution.

## 已知陷阱

- **Always search tools first**: Tool schemas and available operations may change. Never hardcode tool slugs without first discovering them via `RUBE_SEARCH_TOOLS`.
- **Check connection status**: Ensure the SimilarWeb connection is ACTIVE before executing any tools. Expired OAuth tokens require re-认证.
- **Respect rate limits**: If you receive rate limit errors, reduce 请求 frequency and implement backoff.
- **Validate schemas**: Always pass strictly 架构-compliant arguments. Use `RUBE_GET_TOOL_SCHEMAS` to load full input schemas when `schemaRef` is returned instead of `input_schema`.

## 快速参考

| 操作 | 方法 |
