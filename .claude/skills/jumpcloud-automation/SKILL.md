---
name: Jumpcloud 自动化
description: "通过 Rube MCP (Composio) 自动执行 Jumpcloud 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---
# Jumpcloud 自动化
通过 Composio 的 Jumpcloud 工具包和 Rube MCP 自动化 Jumpcloud 操作。
**工具包文档**: [composio.dev/toolkits/jumpcloud](https://composio.dev/toolkits/jumpcloud)
## 前提条件
- Rube MCP 必须已连接
- 通过相关连接工具建立 Jumpcloud 连接
- 始终先调用 RUBE_SEARCH_TOOLS
## 核心工作流模式
### 步骤 1: 发现可用工具
### 步骤 2: 检查连接
### 步骤 3: 执行工具
## 已知陷阱
| 操作 | 方法 |
|---|---|
