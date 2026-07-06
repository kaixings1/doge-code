---
name: sensibo-automation
description: "通过 Rube MCP (Composio) 自动执行 Sensibo 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Sensibo 自动化

通过 Rube MCP 经由 Composio 的 Sensibo 工具包自动执行 Sensibo 操作。

**工具包文档**：[composio.dev/toolkits/sensibo](https://composio.dev/toolkits/sensibo)

## 前置条件

- 必须连接 Rube MCP（`RUBE_SEARCH_TOOLS` 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 使用 `sensibo` 工具包建立活跃的 Sensibo 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**：在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 确认 `RUBE_SEARCH_TOOLS` 有响应，验证 Rube MCP 可用
2. 使用工具包 `sensibo` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接状态不是 ACTIVE，按照返回的认证链接完成设置
4. 在运行任何工作流前确认连接状态显示 ACTIVE

## 工具发现

在执行工作流前始终先发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Sensibo operations", known_fields: ""}]
会话: {generate_id: true}
```

这将返回可用的工具 标识符、输入 schema、推荐的执行计划以及已知陷阱。

## 核心工作流模式

### 第 1 步：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Sensibo task"}]
会话: {id: "existing_session_id"}
```

### 第 2 步：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["sensibo"]
session_id: "your_session_id"
```

### 第 3 步：执行工具

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* 符合 架构 的搜索参数 */}
}]
memory: {}
session_id: "your_session_id"
```

## 已知陷阱

- **始终先搜索**：工具 schema 会变化。未经调用 `RUBE_SEARCH_TOOLS` 切勿硬编码工具 标识符 或参数
- **检查连接**：执行工具前验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **符合 架构**：使用搜索结果中的准确字段名和类型
- **memory 参数**：`RUBE_MULTI_EXECUTE_TOOL` 调用中始终包含 `memory`，即使为空（`{}`）
- **会话复用**：同一工作流内复用会话 ID。新工作流生成新 ID
- **分页**：检查响应中的分页令牌，持续获取直到完成

## 快速参考

| 操作 | 方法 |
|------|-------