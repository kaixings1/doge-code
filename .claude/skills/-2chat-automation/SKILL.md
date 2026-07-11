---
name: 2chat 自动化
description: "通过 Rube MCP (Composio) 自动执行 2chat 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# 通过 Rube MCP 实现 2chat 自动化

通过 Composio 的 2chat 工具包和 Rube MCP 自动化 2chat 操作。

**工具包文档**: [composio.dev/toolkits/_2chat](https://composio.dev/toolkits/_2chat)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 2chat 连接，使用工具包 `_2chat`
- 始终首先调用 `RUBE_SEARCH_TOOLS` 以获取当前工具模式

## 设置

**获取 Rube MCP**: 在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥 — 只需添加端点即可工作。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 是否可用
2. 使用工具包 `_2chat` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE 状态，请按照返回的身份验证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "2chat operations", known_fields: ""}]
session: {generate_id: true}
```

这将返回可用的工具标识符、输入模式、推荐的执行计划和已知问题。

## 核心工作流模式

### 步骤 1: 发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific 2chat task"}]
session: {id: "existing_session_id"}
```

### 步骤 2: 检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["_2chat"]
session_id: "your_session_id"
```

### 步骤 3: 执行工具

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* schema-compliant args from search results */}
}]
memory: {}
session_id: "your_session_id"
```

## 已知问题

- **始终先搜索**: 工具模式会变化。在未调用 `RUBE_SEARCH_TOOLS` 的情况下，切勿硬编码工具标识符或参数
- **检查连接**: 在执行工具之前验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **模式合规性**: 使用搜索结果中的确切字段名称和类型
- **内存参数**: 始终在 `RUBE_MULTI_EXECUTE_TOOL` 调用中包含 `memory`，即使是空的 (`{}`)
- **会话重用**: 在工作流内重用会话 ID。为新工作流生成新的 ID
- **分页**: 检查响应中的分页令牌，并继续获取直到完成

## 快速参考

| 操作 | 方法 |