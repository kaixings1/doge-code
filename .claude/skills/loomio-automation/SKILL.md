---
name: loomio-automation
description: "通过 Rube MCP (Composio) 自动执行 Loomio 任务。使用前始终先搜索工具以获取当前 架构。"
requires:
  mcp: [rube]
---

# 通过 Rube MCP 自动化 Loomio

通过 Rube MCP 经由 Composio 的 Loomio 工具包自动执行 Loomio 操作。

**工具包文档**: [composio.dev/toolkits/loomio](https://composio.dev/toolkits/loomio)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 使用 `loomio` 工具包建立活跃的 Loomio 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 架构

## 设置

**获取 Rube MCP**：在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥 — 只需添加端点即可使用。

1. 确认 `RUBE_SEARCH_TOOLS` 有响应，验证 Rube MCP 可用
2. 调用 `RUBE_MANAGE_CONNECTIONS`，使用工具包 `loomio`
3. 如果连接不是 ACTIVE，按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示 ACTIVE

## 工具发现

在执行业务流程前始终先发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Loomio operations", known_fields: ""}]
会话: {generate_id: true}
```

这将返回可用的工具 标识符、输入 架构、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 第 1 步：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Loomio task"}]
会话: {id: "existing_session_id"}
```

### 第 2 步：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["loomio"]
session_id: "your_session_id"
```

### 第 3 步：执行工具

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* 架构-compliant args from search results */}
}]
memory: {}
session_id: "your_session_id"
```

## 已知陷阱

- **始终先搜索**：工具 架构 会变化。不要在不调用 `RUBE_SEARCH_TOOLS` 的情况下硬编码工具 标识符 或参数
- **检查连接**：在执行业务工具前，验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **架构 合规性**：使用搜索结果中的确切字段名称和类型
- **Memory 参数**：始终在 `RUBE_MULTI_EXECUTE_TOOL` 调用中包含 `memory`，即使为空（`{}`）
- **会话复用**：在工作流中复用会话 ID。为新工作流生成新的会话 ID
- **分页**：检查响应的分页 令牌 并继续获取直到完成

## 快速参考

| 操作 | 方法 |