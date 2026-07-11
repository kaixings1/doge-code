---
name: Mural 自动化
description: "通过 Rube MCP (Composio) 自动执行 Mural 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
 mcp: [rube]
---

# 通过 Rube MCP 自动执行 Mural 操作

通过 Rube MCP 使用 Composio 的 Mural 工具包自动执行 Mural 操作。

**工具包文档**: [composio.dev/toolkits/mural](https://composio.dev/toolkits/mural)

## 前提条件
- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 RUBE_MANAGE_CONNECTIONS 使用工具包 mural 建立活跃的 Mural 连接
- 始终先调用 RUBE_SEARCH_TOOLS 获取当前工具 schema

## 设置
**获取 Rube MCP**: 在客户端配置中添加 https://rube.app/mcp 作为 MCP 服务器。无需 API 密钥。
1. 通过确认 RUBE_SEARCH_TOOLS 有响应来验证 Rube MCP 可用
2. 使用工具包 mural 调用 RUBE_MANAGE_CONNECTIONS
3. 如果连接不是 ACTIVE 状态，按照返回的认证链接完成设置
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 工具发现
在执行工作流之前始终先发现可用工具：
```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Mural operations", known_fields: ""}]
会话: {generate_id: true}
```
这将返回可用工具 标识符、输入 schema、推荐的执行计划和已知陷阱。

## 核心工作流模式
### 步骤 1：发现可用工具
```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Mural task"}]
会话: {id: "existing_session_id"}
```
### 步骤 2：检查连接
```
RUBE_MANAGE_CONNECTIONS
toolkits: ["mural"]
session_id: "your_session_id"
```
### 步骤 3：执行工具
```
RUBE_MULTI_EXECUTE_TOOL
tools: [{ tool_slug: "TOOL_SLUG_FROM_SEARCH", arguments: {/* 符合 架构 的参数 */} }],
memory: {}
session_id: "your_session_id"
```

## 已知陷阱
- **始终先搜索**：工具 schema 会变化。
- **检查连接**：执行前确认 ACTIVE 状态。
- **schema 合规性**：使用搜索结果中的确切字段名和类型。
- **Memory 参数**：始终传入 memory，即使为空（{}）。
- **会话复用**：工作流中复用 ID，新工作流用新 ID。
- **分页**：持续获取直到完成。

## 快速参考
| 操作 | 方法 |