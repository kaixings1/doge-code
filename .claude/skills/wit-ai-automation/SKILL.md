---
name: wit-ai-automation
description: "通过 Rube MCP (Composio) 自动执行 Wit AI 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---

# 通过 Rube MCP 实现 Wit AI 自动化

通过 Composio 的 Wit AI 工具包，经由 Rube MCP 自动化 Wit AI 操作。

**工具包文档**：[composio.dev/toolkits/wit_ai](https://composio.dev/toolkits/wit_ai)

## 前置条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 使用 `wit_ai` 工具包建立活跃的 Wit AI 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具模式

## 设置

**获取 Rube MCP**：在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 通过确认 `RUBE_SEARCH_TOOLS` 有响应来验证 Rube MCP 可用
2. 使用 `wit_ai` 工具包调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE 状态，按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示 ACTIVE

## 工具发现

在执行工作流之前始终先发现可用工具：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Wit AI 操作", known_fields: ""}]
session: {generate_id: true}
```

这会返回可用的工具标识符、输入模式、推荐执行计划和已知陷阱。

## 核心工作流模式

### 第 1 步：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "你特定的 Wit AI 任务"}]
session: {id: "existing_session_id"}
```

### 第 2 步：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["wit_ai"]
session_id: "你的会话 ID"
```

### 第 3 步：执行工具

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "来自搜索的工具标识符",
  arguments: {/* 来自搜索结果的符合模式的参数 */}
}]
memory: {}
session_id: "你的会话 ID"
```

## 已知陷阱

- **始终先搜索**：工具模式会变化。未调用 `RUBE_SEARCH_TOOLS` 时，切勿硬编码工具标识符或参数。
- **检查连接**：在执行工具前验证 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态。
- **模式合规**：使用搜索结果的精确字段名称和类型。
- **内存参数**：始终在 `RUBE_MULTI_EXECUTE_TOOL` 调用中包含 `memory`，即使为空（`{}`）。
- **会话复用**：在工作流内复用会话 ID。为新工作流生成新的会话 ID。
- **分页**：检查响应中的分页令牌，并持续获取直到完成。

## 快速参考

| Operation | Approach |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 41 MINUTES 48 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE