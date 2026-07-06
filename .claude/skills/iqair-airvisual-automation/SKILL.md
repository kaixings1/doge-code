---
name: iqair-airvisual-automation
description: "通过 Rube MCP (Composio) 自动执行 Iqair Airvisual 任务。使用前始终先搜索工具以获取当前 架构。"
requires:
  mcp: [rube]
---
# Iqair Airvisual 自动化
通过 Composio 的 Iqair Airvisual 工具包和 Rube MCP 自动化 Iqair Airvisual 操作。
**工具包文档**: [composio.dev/toolkits/iqair_airvisual](https://composio.dev/toolkits/iqair_airvisual)
## 前提条件
- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 RUBE_MANAGE_CONNECTIONS 使用工具包 iqair_airvisual 建立活跃的 Iqair Airvisual 连接
- 始终先调用 RUBE_SEARCH_TOOLS 以获取当前工具模式
## 设置
**获取 Rube MCP**: 在客户端配置中将 https://rube.app/mcp 添加为 MCP 服务器。无需 API 密钥。
1. 通过确认 RUBE_SEARCH_TOOLS 响应来验证 Rube MCP 是否可用
2. 使用工具包 iqair_airvisual 调用 RUBE_MANAGE_CONNECTIONS
3. 如果连接状态不是 ACTIVE，请按照返回的授权链接完成设置
4. 在运行任何工作流之前，确认连接状态显示为 ACTIVE
## 工具发现
```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Iqair Airvisual operations", known_fields: ""}]
会话: {generate_id: true}
```
## 核心工作流模式
### 步骤 1: 发现可用工具
```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Iqair Airvisual task"}]
会话: {id: "existing_session_id"}
```
### 步骤 2: 检查连接
```
RUBE_MANAGE_CONNECTIONS
toolkits: ["iqair_airvisual"]
session_id: "your_session_id"
```
### 步骤 3: 执行工具
```
RUBE_MULTI_EXECUTE_TOOL
tools: [{tool_slug: "TOOL_SLUG_FROM_SEARCH", arguments: {}}]
memory: {}
session_id: "your_session_id"
```
## 已知陷阱
- 始终先搜索: 工具模式会变化
- 检查连接: 验证 ACTIVE 状态
- 模式合规性: 使用确切的字段名称和类型
- 内存参数: 始终包含 memory，即使为空
- 会话重用: 在工作流内重用会话 ID
- 分页: 检查分页令牌继续获取
| 操作 | 方法 |
|---|---|
