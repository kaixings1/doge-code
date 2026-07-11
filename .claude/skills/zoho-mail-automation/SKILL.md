---
name: Zoho Mail 自动化
description: "通过 Rube MCP (Composio) 自动执行 Zoho Mail 任务。使用前始终先搜索工具以获取当前 schema。""
requires:
  mcp: [rube]
---

# Zoho Mail 自动化

通过 Rube MCP 使用 Composio 的 Zoho Mail 工具包实现 Zoho Mail 操作自动化。

**工具包文档**: [composio.dev/toolkits/zoho_mail](https://composio.dev/toolkits/zoho_mail)

## 先决条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 Zoho Mail 连接，使用工具包 `zoho_mail`
- 始终先调用 `RUBE_SEARCH_TOOLS` 以获取当前工具模式

## 设置

**获取 Rube MCP**: 在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可工作。

1. 确认 `RUBE_SEARCH_TOOLS` 响应，验证 Rube MCP 是否可用
2. 调用 `RUBE_MANAGE_CONNECTIONS` 并指定工具包 `zoho_mail`
3. 如果连接不是 ACTIVE 状态，请按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现

始终 discover available tools before executing workflows:

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Zoho Mail operations", known_fields: ""}]
会话: {generate_id: true}
```

This returns available tool slugs, input schemas, recommended execution plans, and 已知陷阱.

## 核心工作流模式

### 步骤 1: Discover Available Tools

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Zoho Mail task"}]
会话: {id: "existing_session_id"}
```

### 步骤 2: Check Connection

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["zoho_mail"]
session_id: "your_session_id"
```

### 步骤 3: Execute Tools

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

- **始终 search first**: Tool schemas change. 绝不 hardcode tool slugs or arguments without calling `RUBE_SEARCH_TOOLS`
- **检查连接**: Verify `RUBE_MANAGE_CONNECTIONS` shows ACTIVE status before executing tools
- **schema 合规**: Use exact field names and types from the search results
- **Memory 参数**: 始终 include `memory` in `RUBE_MULTI_EXECUTE_TOOL` calls, even if empty (`{}`)
- **会话复用**: Reuse 会话 IDs within a 工作流. Generate new ones for new workflows
- **分页**: Check responses for pagination tokens and continue fetching until complete

## 快速参考

| 操作 | 方法 |