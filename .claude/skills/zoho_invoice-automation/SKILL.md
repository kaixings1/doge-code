---
name: zoho_invoice-automation
description: "通过 Rube MCP (Composio) 自动执行 Zoho Invoice 任务：发票、估算、支出、客户和付款跟踪。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Zoho Invoice 自动化

通过 Rube MCP 使用 Composio 的 Zoho Invoice 工具包实现 Zoho Invoice 操作自动化。

**工具包文档**: [composio.dev/toolkits/zoho_invoice](https://composio.dev/toolkits/zoho_invoice)

## 先决条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Zoho Invoice 连接，使用工具包 `zoho_invoice`
- 始终先调用 `RUBE_SEARCH_TOOLS` 以获取当前工具模式

## 设置

**获取 Rube MCP**: 在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 确认 `RUBE_SEARCH_TOOLS` 响应，验证 Rube MCP 是否可用
2. 调用 `RUBE_MANAGE_CONNECTIONS` 并指定工具包 `zoho_invoice`
3. 如果连接不是 ACTIVE 状态，请按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具：

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "invoices, estimates, expenses, clients, and payment tracking", "known_fields": ""}]
```

这将返回：
- Zoho Invoice 的可用工具标识符
- 推荐执行计划步骤
- 已知问题和边界情况
- 每个工具的输入模式

## 核心工作流

### 1. 发现可用 Zoho Invoice 工具

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "列出所有可用的 Zoho Invoice 工具和功能"
```

Review the returned tools, their descriptions, and input schemas before proceeding.

### 2. Execute Zoho Invoice Operations

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

For complex workflows involving multiple Zoho Invoice operations:

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
- **Check connection status**: Ensure the Zoho Invoice connection is ACTIVE before executing any tools. Expired OAuth tokens require re-认证.
- **Respect rate limits**: If you receive rate limit errors, reduce 请求 frequency and implement backoff.
- **Validate schemas**: 始终 pass strictly schema-compliant arguments. Use `RUBE_GET_TOOL_SCHEMAS` to load full input schemas when `schemaRef` is returned instead of `input_schema`.

## 快速参考

| 操作 | 方法 |