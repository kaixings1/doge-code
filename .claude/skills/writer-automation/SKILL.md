---
name: Writer自动化
description: "通过 Rube MCP (Composio) 自动执行 Writer 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
triggers:
  - "writer automation"
  - "writer-automation"
  - "Writer 自动化"
  - "自动执行 Writer"
---

# Writer 自动化（通过 Rube MCP）

通过 Composio 的 Writer 工具包实现 Writer 操作的自动化，使用 Rube MCP 作为桥接。

**工具包文档**：[composio.dev/toolkits/writer](https://composio.dev/toolkits/writer)

## 前提条件

- Rube MCP 已连接（`RUBE_SEARCH_TOOLS` 可用）
- Writer 连接已通过 `RUBE_MANAGE_CONNECTIONS` 激活（toolkit: `writer`）
- 执行工作流前始终先调用 `RUBE_SEARCH_TOOLS` 获取最新工具 schema

## 配置步骤

**获取 Rube MCP**：在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器，无需 API 密钥，直接添加端点即可。

1. 确认 `RUBE_SEARCH_TOOLS` 响应，验证 Rube MCP 可用
2. 调用 `RUBE_MANAGE_CONNECTIONS` 并指定 toolkit `writer`
3. 如果连接状态不是 ACTIVE，按返回的认证链接完成设置
4. 执行任何工作流前，确认连接状态为 ACTIVE

## 工具发现

执行工作流前始终先发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Writer operations", known_fields: ""}]
会话: {generate_id: true}
```

该调用返回可用工具标识、输入 schema、推荐执行方案和已知陷阱。

## 核心工作流

### 步骤 1：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Writer task"}]
会话: {id: "existing_session_id"}
```

### 步骤 2：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["writer"]
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

## 常见陷阱

- **始终先搜索**：工具 schema 会变更，不要在不调用 `RUBE_SEARCH_TOOLS` 的情况下硬编码工具标识或参数
- **检查连接**：执行前确认 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE
- **遵循 架构**：使用搜索结果中的精确字段名和类型
- **memory 参数**：在 `RUBE_MULTI_EXECUTE_TOOL` 中始终包含 `memory`，即使为空（`{}`）
- **会话复用**：同一工作流内复用会话 ID，不同工作流生成新 ID
- **分页**：检查响应中的分页令牌并继续获取直至完整

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| 操作 | 建议 |