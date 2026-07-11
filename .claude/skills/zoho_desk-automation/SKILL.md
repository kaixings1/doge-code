---
name: Zoho_desk 自动化
description: "通过 Rube MCP (Composio) 自动执行 Zoho Desk 任务：工单、联系人、代理、部门和帮助台操作。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Zoho Desk 自动化

通过 Rube MCP 使用 Composio 的 Zoho Desk 工具包实现 Zoho Desk 操作自动化。

**工具包文档**: [composio.dev/toolkits/zoho_desk](https://composio.dev/toolkits/zoho_desk)

## 先决条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Zoho Desk 连接，使用工具包 `zoho_desk`
- 始终先调用 `RUBE_SEARCH_TOOLS` 以获取当前工具模式

## 设置

**获取 Rube MCP**: 在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 确认 `RUBE_SEARCH_TOOLS` 响应，验证 Rube MCP 是否可用
2. 调用 `RUBE_MANAGE_CONNECTIONS` 并指定工具包 `zoho_desk`
3. 如果连接不是 ACTIVE 状态，请按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具：

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "tickets, contacts, agents, departments, and help desk operations", "known_fields": ""}]
```

这将返回：
- Zoho Desk 的可用工具标识符
- 推荐执行计划步骤
- 已知问题和边界情况
- 每个工具的输入模式

## 核心工作流

### 1. 发现可用 Zoho Desk 工具

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "列出所有可用的 Zoho Desk 工具和功能"
```

在继续之前，请查看返回的工具、它们的描述和输入模式。

### 2. 执行 Zoho Desk 操作

发现工具后，通过以下方式执行：

```
RUBE_MULTI_EXECUTE_TOOL:
  tools:
    - tool_slug: "<discovered_tool_slug>"
      arguments: {<schema-compliant arguments>}
  memory: {}
  sync_response_to_workbench: false
```

### 3. 多步骤工作流

对于涉及多个 Zoho Desk 操作的复杂工作流：

1. 搜索所有相关工具：使用特定用例调用 `RUBE_SEARCH_TOOLS`
2. 首先执行先决步骤（例如，更新前先获取）
3. 使用工具响应在步骤之间传递数据
4. 使用 `RUBE_REMOTE_WORKBENCH` 进行批量操作或数据处理

## 常见模式

### 操作前先搜索
始终在创建新资源之前搜索现有资源，以避免重复。

### 分页
许多列表操作支持分页。检查响应中的 `next_cursor` 或 `page_token`，并继续获取直到完成。

### 错误处理
- 在继续之前检查工具响应中的错误
- 如果工具失败，请验证连接是否仍为 ACTIVE 状态
- 如果连接已过期，请通过 `RUBE_MANAGE_CONNECTIONS` 重新认证

### 批量操作
对于批量操作，使用 `RUBE_REMOTE_WORKBENCH` 并在循环中使用 `ThreadPoolExecutor` 并行执行 `run_composio_tool()`。

## 已知问题

- **始终先搜索工具**: 工具模式和可用操作可能会变化。切勿在不先通过 `RUBE_SEARCH_TOOLS` 发现工具的情况下硬编码工具标识符。
- **检查连接状态**: 在执行任何工具之前确保 Zoho Desk 连接为 ACTIVE 状态。已过期的 OAuth 令牌需要重新认证。
- **遵守速率限制**: 如果收到速率限制错误，请降低请求频率并实施退避机制。
- **验证模式**: 始终传递严格符合模式的参数。当返回 `schemaRef` 而不是 `input_schema` 时，使用 `RUBE_GET_TOOL_SCHEMAS` 加载完整的输入模式。

## 快速参考

| 操作 | 方法 |