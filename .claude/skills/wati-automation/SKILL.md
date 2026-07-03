---
name: Wati自动化
description: "通过 Rube MCP (Composio) 自动执行 Wati 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# Wati 自动化 via Rube MCP

通过 Composio 的 Wati 工具包，经由 Rube MCP 实现 Wati 操作自动化。

**工具包文档**: [composio.dev/toolkits/wati](https://composio.dev/toolkits/wati)

## 前置条件

- 必须连接 Rube MCP（可用 RUBE_SEARCH_TOOLS）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Wati 连接，使用工具包 `wati`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schemas

## 设置

**获取 Rube MCP**：在你的客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 通过确认 `RUBE_SEARCH_TOOLS` 有响应，验证 Rube MCP 可用
2. 使用工具包 `wati` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接未处于 ACTIVE 状态，请按照返回的 auth 链接完成设置
4. 在运行任何工作流之前，确认连接状态显示 ACTIVE

## 工具发现

在执行工作流之前，始终先发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Wati operations", known_fields: ""}]
session: {generate_id: true}
```

这将返回可用的工具 slugs、输入 schemas、推荐的执行计划和已知陷阱。

## 核心工作流模式

### 第一步：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Wati task"}]
session: {id: "existing_session_id"}
```

### 第二步：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["wati"]
session_id: "your_session_id"
```

### 第三步：执行工具

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

- **始终先搜索**：工具 schemas 会变化。永远不要硬编码工具 slugs 或参数——始终先调用 `RUBE_SEARCH_TOOLS`
- **检查连接**：在执行任何工具之前，验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **Schema 合规**：使用搜索结果中的确切字段名称和类型
- **Memory 参数**：在 `RUBE_MULTI_EXECUTE_TOOL` 调用中始终包含 `memory`，即使为空（`{}`）
- **会话复用**：在工作流内复用会话 ID。为新工作流生成新的会话 ID
- **分页**：检查响应中的分页标记，并继续获取直到完成

## 快速参考

| 操作 | 方法 |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 11 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE