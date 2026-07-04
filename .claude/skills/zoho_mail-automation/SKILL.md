---
name: zoho_mail-automation
description: "通过 Rube MCP (Composio) 自动执行 Zoho Mail 任务：email sending, folders, labels, and mailbox management. Always search tools first for current schemas."
requires:
  mcp: [rube]
---

# 通过 Rube MCP 实现 Zoho Mail 自动化

通过 Rube MCP 使用 Composio 的 Zoho Mail 工具包实现 Zoho Mail 操作自动化。

**工具包文档**: [composio.dev/toolkits/zoho_mail](https://composio.dev/toolkits/zoho_mail)

## 先决条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Zoho Mail 连接，使用工具包 `zoho_mail`
- 始终先调用 `RUBE_SEARCH_TOOLS` 以获取当前工具模式

## 设置

**获取 Rube MCP**: 在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 确认 `RUBE_SEARCH_TOOLS` 响应，验证 Rube MCP 是否可用
2. 调用 `RUBE_MANAGE_CONNECTIONS` 并指定工具包 `zoho_mail`
3. 如果连接不是 ACTIVE 状态，请按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具：

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "email sending, folders, labels, and mailbox management", "known_fields": ""}]
```

这将返回：
- Zoho Mail 的可用工具标识符
- 推荐执行计划步骤
- 已知问题和边界情况
- 每个工具的输入模式

## 核心工作流

### 1. 发现可用 Zoho Mail 工具

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "列出所有可用的 Zoho Mail 工具和功能"
```

Review the returned tools, their descriptions, and input schemas before proceeding.

### 2. Execute Zoho Mail Operations

After discovering tools, execute them via:

```
RUBE_MULTI_EXECUTE_TOOL:
  tools:
    - tool_slug: "<discovered_tool_slug>"
      arguments: {<schema-compliant arguments>}
  memory: {}
  sync_response_to_workbench: false
```

### 3. Multi-Step Workflows

For complex workflows involving multiple Zoho Mail operations:

1. Search for all relevant tools: `RUBE_SEARCH_TOOLS` with specific use case
2. Execute prerequisite steps first (e.g., fetch before update)
3. Pass data between steps using tool responses
4. Use `RUBE_REMOTE_WORKBENCH` for bulk operations or data processing

## Common Patterns

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
- **Check connection status**: Ensure the Zoho Mail connection is ACTIVE before executing any tools. Expired OAuth tokens require re-authentication.
- **Respect rate limits**: If you receive rate limit errors, reduce request frequency and implement backoff.
- **Validate schemas**: Always pass strictly schema-compliant arguments. Use `RUBE_GET_TOOL_SCHEMAS` to load full input schemas when `schemaRef` is returned instead of `input_schema`.

## 快速参考

| Operation | Approach |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 41 MINUTES 00 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE