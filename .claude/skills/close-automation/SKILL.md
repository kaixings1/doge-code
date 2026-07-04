---
name: close-自动化
description: "通过 Rube MCP (Composio) 自动化 Close 操作。始终先调用 RUBE_SEARCH_TOOLS 获取最新工具架构。"
requires:
  mcp: [rube]
---

# 通过 Rube MCP 实现 Close 自动化

通过 Rube MCP 使用 Composio 的 Close 工具包自动化 Close 操作。

**工具包文档**：[composio.dev/toolkits/close](https://composio.dev/toolkits/close)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Close 连接，工具包为 `close`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**：在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥 — 只需添加 endpoint 即可使用。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 使用工具包 `close` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE，按返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Close operations", known_fields: ""}]
session: {generate_id: true}
```

这将返回可用的工具 slug、输入 schema、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 步骤 1：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Close task"}]
session: {id: "existing_session_id"}
```

### 步骤 2：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["close"]
session_id: "your_session_id"
```

### 步骤 3：执行工具

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* schema-compliant args from search results */}
}]
memory: {}
session_id: "your_session_id"
```

## 已知陷阱

- **始终先搜索**：工具 schema 会变化。不调用 `RUBE_SEARCH_TOOLS` 就不要硬编码工具 slug 或参数
- **检查连接**：执行工具前验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **Schema 合规**：使用搜索结果中的确切字段名和类型
- **Memory 参数**：在 `RUBE_MULTI_EXECUTE_TOOL` 调用中始终包含 `memory`，即使是空的（`{}`）
- **会话复用**：在同一工作流中复用会话 ID。为新工作流生成新的
- **分页**：检查响应中的分页 token 并继续获取直到完成

## 快速参考/n/n| 操作 | 方法 |/n|---|---|/n| 搜索工具 | 使用 RUBE_SEARCH_TOOLS |/n| 检查连接 | 使用 RUBE_MANAGE_CONNECTIONS |/n| 执行工具 | 使用 RUBE_MULTI_EXECUTE_TOOL |/n| 处理分页 | 检查响应中的分页 token |/n| 会话管理 | 复用现有会话 ID |/n/n*由 [Composio](https://composio.dev) 提供支持*/n