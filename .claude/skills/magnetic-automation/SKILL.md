---
name: magnetic-automation
description: "通过 Rube MCP (Composio) 自动执行 Magnetic 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Magnetic 自动化

通过 Rube MCP 经 Composio 的 Magnetic 工具包自动化 Magnetic 操作。

**工具包文档**：[composio.dev/toolkits/magnetic](https://composio.dev/toolkits/magnetic)

## 前提条件

- 必须连接 Rube MCP（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 使用 `magnetic` 工具包激活 Magnetic 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**：将 `https://rube.app/mcp` 作为 MCP 服务器添加到客户端配置中。无需 API 密钥——只需添加端点即可使用。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 使用 `magnetic` 工具包调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接未处于 ACTIVE 状态，请按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

在执行工作流之前始终发现可用的工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Magnetic operations", known_fields: ""}]
会话: {generate_id: true}
```

这将返回可用的工具标识、输入 schema、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 第 1 步：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Magnetic task"}]
会话: {id: "existing_session_id"}
```

### 第 2 步：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["magnetic"]
session_id: "your_session_id"
```

### 第 3 步：执行工具

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

- **始终先搜索**：工具 schema 会变化。未经调用 `RUBE_SEARCH_TOOLS` 切勿硬编码工具标识或参数
- **检查连接**：在执行工具前验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **schema 合规**：使用搜索结果中的确切字段名称和类型
- **Memory 参数**：始终在 `RUBE_MULTI_EXECUTE_TOOL` 调用中包含 `memory`，即使为空（`{}`）
- **会话复用**：在同一工作流中复用会话 ID。为新工作流生成新的会话 ID
- **分页**：检查响应中的分页标记，并持续获取直到完成

## 快速参考

| 操作 | 方法 |
|------|------|