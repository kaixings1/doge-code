---
name: new_relic-automation
description: "通过 Rube MCP (Composio) 自动执行 New Relic 任务：APM、告警、仪表盘、NRQL 查询和基础设施监控。始终先搜索工具以获取当前架构。"
requires:
 mcp: [rube]
---

# 通过 Rube MCP 自动执行 New Relic 操作

通过 Rube MCP 使用 Composio 的 New Relic 工具包自动执行 New Relic 操作。

**工具包文档**: [composio.dev/toolkits/new_relic](https://composio.dev/toolkits/new_relic)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 RUBE_MANAGE_CONNECTIONS 使用工具包 new_relic 建立活跃的 New Relic 连接
- 始终先调用 RUBE_SEARCH_TOOLS 获取当前工具 架构

## 设置
**获取 Rube MCP**: 在客户端配置中添加 https://rube.app/mcp 作为 MCP 服务器。无需 API 密钥 — 只需添加端点即可使用。
1. 通过确认 RUBE_SEARCH_TOOLS 有响应来验证 Rube MCP 可用
2. 使用工具包 new_relic 调用 RUBE_MANAGE_CONNECTIONS
3. 如果连接不是 ACTIVE 状态，按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

在执行工作流之前始终先发现可用工具：
```
RUBE_SEARCH_TOOLS: queries=[{"use_case": "APM, alerts, dashboards, NRQL queries, and infrastructure monitoring", "known_fields": ""}]
```

这将返回：
- 可用的 New Relic 工具 标识符
- 推荐的执行计划步骤
- 已知陷阱和边界情况
- 每个工具的输入 架构

## 核心工作流
### 1. 发现可用的 New Relic 工具
```
RUBE_SEARCH_TOOLS:
 queries:
 - use_case: "list all available New Relic tools and 能力"
```
在继续之前，查看返回的工具、描述和输入 架构。

### 2. 执行 New Relic 操作
发现工具后，通过以下方式执行：
```
RUBE_MULTI_EXECUTE_TOOL:
 tools:
 - tool_slug: "<discovered_tool_slug>",
 arguments: {<架构-compliant arguments>}
 memory: {}
 sync_response_to_workbench: false
```

### 3. 多步骤工作流
对于涉及多个 New Relic 操作的复杂工作流：
1. 搜索所有相关工具：RUBE_SEARCH_TOOLS 指定具体用例
2. 先执行前置步骤（例如，先获取再更新）
3. 使用工具响应在步骤之间传递数据
4. 使用 RUBE_REMOTE_WORKBENCH 进行批量操作或数据处理

## 常见模式
### 先搜索再操作
在创建新资源之前始终先搜索现有资源以避免重复。

### 分页
许多列表操作支持分页。检查响应中的 next_cursor 或 page_token，持续获取直到耗尽。

### 错误处理
- 在继续之前检查工具响应中的错误
- 如果工具失败，验证连接是否仍为 ACTIVE 状态
- 如果连接过期，通过 RUBE_MANAGE_CONNECTIONS 重新认证

### 批量操作
对于批量操作，使用 RUBE_REMOTE_WORKBENCH 配合循环中的 run_composio_tool() 和 ThreadPoolExecutor 进行并行执行。

## 已知陷阱
- **始终先搜索工具**：工具 架构 和可用操作可能会变化。未先通过 RUBE_SEARCH_TOOLS 发现之前切勿硬编码工具 标识符。
- **检查连接状态**：在执行任何工具之前确保 New Relic 连接为 ACTIVE。过期的 OAuth 令牌需要重新认证。
- **遵守速率限制**：如果收到速率限制错误，降低请求频率并实现退避。
- **验证 架构**：始终传递严格符合 架构 的参数。当返回 schemaRef 而非 input_schema 时，使用 RUBE_GET_TOOL_SCHEMAS 加载完整的输入 架构。

## 快速参考
| 操作 | 方法 |