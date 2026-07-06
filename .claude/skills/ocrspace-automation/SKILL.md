---
name: ocrspace-automation
description: "通过 Rube MCP (Composio) 自动执行 Ocrspace 任务。使用前始终先搜索工具以获取当前 架构。"
requires:
  mcp: [rube]
---

# Ocrspace 自动化

通过 Rube MCP 使用 Composio 的 Ocrspace 工具包自动化 Ocrspace 操作。

**工具包文档**: [composio.dev/toolkits/ocrspace](https://composio.dev/toolkits/ocrspace)

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Ocrspace 连接，工具包为 `ocrspace`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 架构

## 设置

**获取 Rube MCP**：在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥 — 只需添加 端点 即可使用。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 使用工具包 `ocrspace` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE，按返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示 ACTIVE

## 工具发现

在执行工作流之前始终发现可用工具:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Ocrspace 操作", known_fields: ""}]
会话: {generate_id: true}
```

这将返回可用的工具 标识符、输入 架构、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 步骤 1：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "你的特定 Ocrspace 任务"}]
会话: {id: "existing_session_id"}
```

### 步骤 2：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["ocrspace"]
session_id: "your_session_id"
```

### 步骤 3：执行工具

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "来自搜索的_TOOL_SLUG",
  arguments: {/* 来自搜索结果且符合 架构 的参数 */}
}]
memory: {}
session_id: "your_session_id"
```

## 已知陷阱

- **始终先搜索**：工具 架构 会变化。不调用 `RUBE_SEARCH_TOOLS` 就不要硬编码工具 标识符 或参数
- **检查连接**：执行工具前验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **架构 合规**：使用搜索结果中的确切字段名和类型
- **Memory 参数**：在 `RUBE_MULTI_EXECUTE_TOOL` 调用中始终包含 `memory`，即使是空的（`{}`）
- **会话复用**：在同一工作流中复用会话 ID。为新工作流生成新的
- **分页**：检查响应中的分页令牌并继续获取直到完成

## 快速参考

| 操作 | 方法 |
|-----------|----------|
| 查找工具 | `RUBE_SEARCH_TOOLS` 使用 Ocrspace 特定用例 |
| 连接 | `RUBE_MANAGE_CONNECTIONS` 使用工具包 `ocrspace` |
| 执行 | `RUBE_MULTI_EXECUTE_TOOL` 使用已发现的工具 标识符 |
| 批量操作 | `RUBE_REMOTE_WORKBENCH` 配合 `run_composio_tool()` |
| 完整 架构 | `RUBE_GET_TOOL_SCHEMAS` 用于带 `schemaRef` 的工具 |

---
*由 [Composio](https://composio.dev) 提供支持*
