---
name: Zoho库存自动化
description: "通过 Rube MCP (Composio) 自动执行 Zoho Inventory 任务：物品、订单、仓库、发货和库存管理。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Zoho 库存自动化 via Rube MCP

通过 Composio 的 Zoho Inventory 工具包，经由 Rube MCP 实现 Zoho 库存操作自动化。

**工具包文档**: [composio.dev/toolkits/zoho_inventory](https://composio.dev/toolkits/zoho_inventory)

## 前置条件

- 必须连接 Rube MCP（可用 RUBE_SEARCH_TOOLS）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Zoho Inventory 连接，使用工具包 `zoho_inventory`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schemas

## 设置

**获取 Rube MCP**：在你的客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 通过确认 `RUBE_SEARCH_TOOLS` 有响应，验证 Rube MCP 可用
2. 使用工具包 `zoho_inventory` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接未处于 ACTIVE 状态，请按照返回的 auth 链接完成设置
4. 在运行任何工作流之前，确认连接状态显示 ACTIVE

## 工具发现

在执行工作流之前，始终先发现可用工具：

```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "items, orders, warehouses, shipments, and stock management", "known_fields": ""}]
```

这将返回：
- Zoho Inventory 的可用工具 slugs
- 推荐的执行计划步骤
- 已知陷阱和边缘情况
- 每个工具的输入 schemas

## 核心工作流

### 1. 发现可用的 Zoho Inventory 工具

```
RUBE_SEARCH_TOOLS:
  queries:
    - use_case: "list all available Zoho Inventory tools and 能力"
```

在继续之前，查看返回的工具、它们的描述和输入 schemas。

### 2. 执行 Zoho Inventory 操作

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

对于涉及多个 Zoho Inventory 操作的复杂工作流：

1. 使用 `RUBE_SEARCH_TOOLS` 搜索所有相关工具（带特定用例）
2. 先执行前置步骤（例如先获取再更新）
3. 使用工具响应在各步骤之间传递数据
4. 对批量操作或数据处理使用 `RUBE_REMOTE_WORKBENCH`

## 常见模式

### 先搜索后行动
在创建新资源之前始终搜索现有资源，以避免重复。

### 分页
许多列表操作支持分页。检查响应中的 `next_cursor` 或 `page_token`，并继续获取直到结束。

### 错误处理
- 继续之前检查工具响应中的错误
- 如果工具失败，验证连接是否仍然 ACTIVE
- 如果连接过期，通过 `RUBE_MANAGE_CONNECTIONS` 重新认证

### 批量操作
对于批量操作，使用 `RUBE_REMOTE_WORKBENCH` 配合 `run_composio_tool()`，使用 `ThreadPoolExecutor` 循环执行以并行处理。

## 已知陷阱

- **始终先搜索工具**：工具 schemas 和可用操作可能更改。永远不要硬编码工具 slugs——始终先通过 `RUBE_SEARCH_TOOLS` 发现它们。
- **检查连接状态**：在执行任何工具之前，确保 Zoho Inventory 连接为 ACTIVE。过期的 OAuth tokens 需要重新认证。
- **尊重速率限制**：如果收到速率限制错误，降低请求频率并实施退避。
- **验证 schemas**：始终传递严格符合 架构 的参数。当返回 `schemaRef` 而非 `input_schema` 时，使用 `RUBE_GET_TOOL_SCHEMAS` 加载完整输入 schemas。

## 快速参考

| 操作 | 方法 |
