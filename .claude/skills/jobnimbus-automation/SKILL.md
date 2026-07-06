---
name: jobnimbus-automation
description: "通过 Rube MCP (Composio) 自动执行 Jobnimbus 任务。使用前始终先搜索工具以获取当前 架构。"
requires:
  mcp: [rube]
---
# Jobnimbus 自动化
通过 Composio 的 Jobnimbus 工具包和 Rube MCP 自动化 Jobnimbus 操作。
**工具包文档**: [composio.dev/toolkits/jobnimbus](https://composio.dev/toolkits/jobnimbus)
## 前提条件
- Rube MCP 必须已连接
- 通过 RUBE_MANAGE_CONNECTIONS 使用 jobnimbus 连接
- 始终先调用 RUBE_SEARCH_TOOLS
## 核心工作流模式
### 步骤 1: 发现可用工具
### 步骤 2: 检查连接
### 步骤 3: 执行工具
## 已知陷阱
| 操作 | 方法 |
|---|---|
