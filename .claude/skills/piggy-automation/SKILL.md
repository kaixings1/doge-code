---
name: piggy-automation
description: "通过 Rube MCP (Composio) 自动执行 Piggy 任务。使用前始终先搜索工具以获取当前 schema。""
requires:
  mcp: [rube]
---

# 通过 Rube MCP 自动化 Piggy

通过 Composio 的 Piggy 工具集经由 Rube MCP 自动化 Piggy 操作。

**工具集文档**: [composio.dev/toolkits/piggy](https://composio.dev/toolkits/piggy)

## 先决条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 与工具集 `piggy` 建立活跃的 Piggy 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**: 在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可使用。

1. 确认 `RUBE_SEARCH_TOOLS` 有响应以验证 Rube MCP 可用
2. 使用工具集 `piggy` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接状态不是 ACTIVE，按返回的认证链接完成设置
4. 在运行任何工作流前确认连接状态显示 ACTIVE

## 工具发现

在执行工作流前始终先发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Piggy operations", known_fields: ""}]
会话: {generate_id: true}
```

这将返回可用的工具 标识符、输入 schema、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 步骤 1：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Piggy task"}]
会话: {id: "existing_session_id"}
```

### 步骤 2：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["piggy"]
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

- **始终先搜索**: 工具 schema 会变化。未调用 `RUBE_SEARCH_TOOLS` 时绝不要硬编码工具 标识符 或参数
- **检查连接**: 执行工具前确认 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **schema 合规**: 使用搜索结果中的精确字段名和类型
- **Memory 参数**: 始终在 `RUBE_MULTI_EXECUTE_TOOL` 调用中包含 `memory`，即使为空（`{}`）
- **会话复用**: 在工作流中复用会话 ID。新工作流生成新 ID
- **分页**: 检查响应中的分页令牌，持续获取直到完成

## 快速参考

| 操作 | 方法 |