---
name: jigsawstack-automation
description: "通过 Rube MCP (Composio) 自动执行 Jigsawstack 任务。使用前始终先搜索工具以获取当前 schema。"
requires:
  mcp: [rube]
---
# 通过 Rube MCP 实现 Jigsawstack 自动化
通过 Composio 的 Jigsawstack 工具包和 Rube MCP 自动化 Jigsawstack 操作。
**工具包文档**: [composio.dev/toolkits/jigsawstack](https://composio.dev/toolkits/jigsawstack)
## 前提条件
- Rube MCP 必须已连接
- 通过 RUBE_MANAGE_CONNECTIONS 使用 jigsawstack 连接
- 始终先调用 RUBE_SEARCH_TOOLS
## 设置
**获取 Rube MCP**: 添加 https://rube.app/mcp 作为 MCP 服务器。
## 核心工作流模式
### 步骤 1: 发现可用工具
### 步骤 2: 检查连接
### 步骤 3: 执行工具
## 已知陷阱
- 始终先搜索: 工具模式会变化
- 检查连接: 验证 ACTIVE 状态
| 操作 | 方法 |
|---|---|
