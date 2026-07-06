---
name: lemon_squeezy-automation
description: "通过 Rube MCP (Composio) 自动执行 Lemon Squeezy 任务：products, orders, subscriptions, checkouts, and digital sales. Always search tools first for current schemas."
requires:
  mcp: [rube]
---

# Lemon Squeezy 自动化

通过 Rube MCP 使用 Composio 的 Lemon Squeezy 工具包自动执行 Lemon Squeezy 操作。

**工具包文档**：[composio.dev/toolkits/lemon_squeezy](https://composio.dev/toolkits/lemon_squeezy)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Lemon Squeezy 连接，工具包为 `lemon_squeezy`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 架构

## 设置

**获取 Rube MCP**：在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥 — 只需添加 端点 即可使用。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 使用工具包 `lemon_squeezy` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE，按返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具：

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "产品、订单、订阅、结账和数字销售", "known_fields": ""}]
```

这将返回：
- Lemon Squeezy 的可用工具 标识符
- 推荐的执行计划步骤
- 已知陷阱和边缘情况
- 每个工具的输入 架构

## 核心工作流

### 1. 发现可用的 Lemon Squeezy 工具

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "列出所有可用的 Lemon Squeezy 工具和功能"
```

在继续之前审查返回的工具、其描述和输入 架构。

### 2. 执行 Lemon Squeezy 操作

发现工具后，通过以下方式执行：

```
RUBE_MULTI_EXECUTE_TOOL:
  tools:
    - tool_slug: "<发现的工具_slug>"
      arguments: {<符合 架构 的参数>}
  memory: {}
  sync_response_to_workbench: false
```

### 3. 多步骤工作流

对于涉及多个 Lemon Squeezy 操作的复杂工作流：

1. 搜索所有相关工具：使用特定用例的 `RUBE_SEARCH_TOOLS`
2. 先执行前置步骤（例如，先获取再更新）
3. 使用工具响应在步骤之间传递数据
4. 对批量操作或数据处理使用 `RUBE_REMOTE_WORKBENCH`

## 常见模式

### 先搜索再操作
在创建新资源之前始终搜索现有资源以避免重复。

### 分页
许多列表操作支持分页。检查响应中的 `next_cursor` 或 `page_token` 并继续获取直到完成。

### 错误处理
- 在继续之前检查工具响应中的错误
- 如果工具失败，验证连接是否仍为 ACTIVE
- 如果连接过期，通过 `RUBE_MANAGE_CONNECTIONS` 重新认证

### 批量操作
对于批量操作，使用 `RUBE_REMOTE_WORKBENCH`，在循环中配合 `ThreadPoolExecutor` 使用 `run_composio_tool()` 进行并行执行。

## 已知陷阱

- **始终先搜索工具**：工具 架构 和可用操作可能会变化。在通过 `RUBE_SEARCH_TOOLS` 发现之前，切勿硬编码工具 标识符。
- **检查连接状态**：在执行任何工具之前确保 Lemon Squeezy 连接为 ACTIVE。过期的 OAuth 令牌需要重新认证。
- **遵守速率限制**：如果收到速率限制错误，降低请求频率并实现退避策略。
- **验证 架构**：始终传递严格符合 架构 的参数。当返回 `schemaRef` 而非 `input_schema` 时，使用 `RUBE_GET_TOOL_SCHEMAS` 加载完整输入 架构。

## 快速参考

| 操作 | 方法 |
