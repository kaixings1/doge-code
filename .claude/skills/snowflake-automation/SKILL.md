---
name: —列出数据库、模式和表、执行 SQL 语句和管理数据工作流。
description: "通过 Composio MCP 集成自动执行 Snowflake 数据仓库操作——列出数据库、模式和表、执行 SQL 语句和管理数据工作流。"
requires:
  mcp:
    - rube
---

# Snowflake 自动化

自动执行 Snowflake 数据仓库工作流——发现数据库、浏览模式和表、执行任意 SQL（SELECT、DDL、DML），以及将 Snowflake 数据操作集成到跨应用管道中。

**工具包文档：** [composio.dev/toolkits/snowflake](https://composio.dev/toolkits/snowflake)

## 前置条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 使用工具包 `snowflake` 建立活动的 Snowflake 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 以获取当前工具 schema

## 设置

**获取 Rube MCP**：在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 调用 `RUBE_MANAGE_CONNECTIONS` 并指定工具包 `snowflake`
3. 如果连接不是 ACTIVE，按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

在执行工作流之前始终先发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Snowflake operations", known_fields: ""}]
会话: {generate_id: true}
```

这将返回可用的工具 标识符、输入 schema、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 步骤 1：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Snowflake task"}]
会话: {id: "existing_session_id"}
```

### 步骤 2：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["snowflake"]
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

- **始终先搜索**：工具 schema 会变化。未经调用 `RUBE_SEARCH_TOOLS` 切勿硬编码工具 标识符 或参数
- **检查连接**：执行工具前确认 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **schema 合规**：使用搜索结果中的精确字段名和类型
- **Memory 参数**：始终在 `RUBE_MULTI_EXECUTE_TOOL` 调用中包含 `memory`，即使为空（`{}`）
- **会话复用**：在工作流中复用会话 ID。为新工作流生成新 ID
- **分页**：检查响应中的分页令牌，持续获取直到完成

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` 并指定用例 |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` 并指定工具包 |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` 并传递工具 标识符 和参数 |
| 处理分页 | 检查响应中的 `next_cursor` 或 `page_token` |
| 错误处理 | 验证连接状态并重新认证 |
| 批量操作 | 使用 `RUBE_REMOTE_WORKBENCH` 进行并行处理 |