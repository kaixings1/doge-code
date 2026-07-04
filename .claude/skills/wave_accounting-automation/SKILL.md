---
name: wave_accounting-automation
description: "通过 Rube MCP (Composio) 自动执行 Wave Accounting 任务：invoices, customers, payments, and small business accounting. Always search tools first for current schemas."
requires:
  mcp: [rube]
---

# 通过 Rube MCP 实现 Wave Accounting 自动化

通过 Rube MCP 使用 Composio 的 Wave Accounting 工具包自动化 Wave Accounting 操作。

**工具包文档**：[composio.dev/toolkits/wave_accounting](https://composio.dev/toolkits/wave_accounting)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Wave Accounting 连接，工具包为 `wave_accounting`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**：在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥 — 只需添加 endpoint 即可使用。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 使用工具包 `wave_accounting` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE，按返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具：

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "invoices, customers, payments, and small business accounting", "known_fields": ""}]
```

这将返回：
- Wave Accounting 可用的工具 slug
- 推荐的执行计划步骤
- 已知的陷阱和边界情况
- 每个工具的输入 schema

## 核心工作流

### 1. 发现可用的 Wave Accounting 工具

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "list all available Wave Accounting tools and capabilities"
```

在执行之前，请查看返回的工具、它们的描述和输入 schema。

### 2. 执行 Wave Accounting 操作

发现工具后，通过以下方式执行它们：

```
RUBE_MULTI_EXECUTE_TOOL:
  tools:
    - tool_slug: "<discovered_tool_slug>"
      arguments: {<schema-compliant arguments>}
  memory: {}
  sync_response_to_workbench: false
```

### 3. 多步骤工作流

对于涉及多个 Wave Accounting 操作的复杂工作流：

1. 搜索所有相关工具：使用特定用例调用 `RUBE_SEARCH_TOOLS`
2. 首先执行先决条件步骤（例如，在更新之前获取）
3. 使用工具响应在步骤之间传递数据
4. 对于批量操作或数据处理，使用 `RUBE_REMOTE_WORKBENCH`

## 常见模式

### 操作前先搜索
在创建新资源之前始终搜索现有资源，以避免重复。

### 分页
许多列表操作支持分页。检查响应中的 `next_cursor` 或 `page_token`，并持续获取直到完成。

### 错误处理
- 在执行之前检查工具响应是否有错误
- 如果工具失败，验证连接是否仍然 ACTIVE
- 如果连接过期，通过 `RUBE_MANAGE_CONNECTIONS` 重新认证

### 批量操作
对于批量操作，使用 `RUBE_REMOTE_WORKBENCH` 与 `run_composio_tool()` 在循环中使用 `ThreadPoolExecutor` 进行并行执行。

## 已知陷阱

- **始终先搜索工具**：工具 schema 和可用操作可能会变化。切勿在不首先通过 `RUBE_SEARCH_TOOLS` 发现它们的情况下硬编码工具 slug。
- **检查连接状态**：在执行任何工具之前确保 Wave Accounting 连接是 ACTIVE。过期的 OAuth 令牌需要重新认证。
- **遵守速率限制**：如果收到速率限制错误，请降低请求频率并实现退避机制。
- **验证 schema**：始终传递严格符合 schema 的参数。当返回 `schemaRef` 而不是 `input_schema` 时，使用 `RUBE_GET_TOOL_SCHEMAS` 加载完整的输入 schema。

## 快速参考

| 操作 | 方法 |