---
name: Leadfeeder 自动化
description: "通过 Rube MCP (Composio) 自动执行 Leadfeeder 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Leadfeeder 自动化

通过 Rube MCP 使用 Composio 的 Leadfeeder 工具包自动执行 Leadfeeder 操作。

**工具包文档**: [composio.dev/toolkits/leadfeeder](https://composio.dev/toolkits/leadfeeder)

## 前提条件

- Rube MCP 必须已连接 (RUBE_SEARCH_TOOLS 可用)
- Active Leadfeeder connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `leadfeeder`
- Always call `RUBE_SEARCH_TOOLS` first to get 当前工具 schema

## 设置

**获取 Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client 配置. No API keys needed — just add the 端点 and it works.

1. 验证 Rube MCP 可用 by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `leadfeeder`
3. 如果连接不是 ACTIVE, 按返回的认证链接完成设置
4. 确认连接状态显示 ACTIVE before running any workflows

## 工具发现

在执行工作流之前始终发现可用工具:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Leadfeeder operations", known_fields: ""}]
会话: {generate_id: true}
```

这将返回可用的工具 标识符、输入 schema、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 步骤 1：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Leadfeeder task"}]
会话: {id: "existing_session_id"}
```

### 步骤 2：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["leadfeeder"]
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

- **始终先搜索**: 工具 schema 会变化。不调用 `RUBE_SEARCH_TOOLS`
- **检查连接**: Verify `RUBE_MANAGE_CONNECTIONS` shows ACTIVE status before executing tools
- **schema 合规**: 使用搜索结果中的确切字段名和类型
- **Memory 参数**: Always include `memory` in `RUBE_MULTI_EXECUTE_TOOL` calls, even if empty (`{}`)
- **会话复用**: 在同一工作流中复用会话 ID。为新工作流生成新的
- **分页**: 检查响应中的分页 令牌 并继续获取直到完成

## 快速参考

| 操作 | 方法 |
