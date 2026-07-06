---
name: worksnaps-automation
description: "通过 Rube MCP (Composio) 自动执行 Worksnaps 任务。使用前始终先搜索工具以获取当前 架构。"
requires: mcp: [rube]
--- # Worksnaps 自动化 — 通过 Rube MCP 通过 Rube MCP 使用 Composio 的 Worksnaps 工具包自动化 Worksnaps 操作。 **工具包文档**: [composio.dev/toolkits/worksnaps](https://composio.dev/toolkits/worksnaps) ## 前提条件 - Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立有效的 Worksnaps 连接，工具包 `worksnaps`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 架构 ## 设置 **获取 Rube MCP**: 在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API key — 只需添加端点即可使用。 1. 通过确认 `RUBE_SEARCH_TOOLS` 有响应来验证 Rube MCP 可用
2. 使用工具包 `worksnaps` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接未处于 ACTIVE 状态，请按返回的授权链接完成设置
4. 运行任何工作流前确认连接状态为 ACTIVE ## 工具发现 执行工作流前始终先发现可用工具： ```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Worksnaps 操作", known_fields: ""}]
会话: {generate_id: true}
``` 此命令返回可用工具 标识符、输入 架构、推荐执行计划及已知陷阱。 ## 核心工作流模式 ### 第 1 步：发现可用工具 ```
RUBE_SEARCH_TOOLS
queries: [{use_case: "你的具体 Worksnaps 任务"}]
会话: {id: "existing_session_id"}
``` ### 第 2 步：检查连接 ```
RUBE_MANAGE_CONNECTIONS
toolkits: ["worksnaps"]
session_id: "your_session_id"
``` ### 第 3 步：执行工具 ```
RUBE_MULTI_execute_TOOL
tools: [{ tool_slug: "TOOL_SLUG_FROM_SEARCH", arguments: {/* 来自搜索结果的 架构 合规参数 */}
}]
memory: {}
session_id: "your_session_id"
``` ## 已知陷阱 - **始终先搜索**: 工具 架构 会变化。从未在不调用 `RUBE_SEARCH_TOOLS` 的情况下硬编码工具 标识符 或参数
- **检查连接**: 执行工具前确认 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **架构 合规性**: 使用搜索结果中的精确字段名和类型
- **Memory 参数**: 始终在 `RUBE_MULTI_execute_TOOL` 调用中包含 `memory`，即使为空 (`{}`)
- **会话 复用**: 在同一工作流内复用 会话 ID。为新工作流生成新 ID
- **分页**: 检查响应中的分页 令牌，并继续获取直至完成 ## 快速参考 | 操作 | 方法 |
|------|------|
| 发现工具 | `RUBE_SEARCH_TOOLS` |
| 检查连接 | `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | `RUBE_MULTI_execute_TOOL` |
