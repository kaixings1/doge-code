---
name: mx-technologies-automation
description: "通过 Rube MCP (Composio) 自动执行 MX Technologies 任务。使用前始终先搜索工具以获取当前 架构。"
requires:
 mcp: [rube]
---

# 通过 Rube MCP 自动执行 MX Technologies 操作

通过 Rube MCP 使用 Composio 的 MX Technologies 工具包自动执行 MX Technologies 操作。

**工具包文档**: [composio.dev/toolkits/mx_technologies](https://composio.dev/toolkits/mx_technologies)

## 前提条件
- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 RUBE_MANAGE_CONNECTIONS 使用工具包 mx_technologies 建立活跃连接
- 始终先调用 RUBE_SEARCH_TOOLS 获取当前工具 架构

## 设置
**获取 Rube MCP**: 在客户端配置中添加 https://rube.app/mcp 作为 MCP 服务器。
1. 确认 RUBE_SEARCH_TOOLS 有响应
2. 使用工具包 mx_technologies 调用 RUBE_MANAGE_CONNECTIONS
3. 如果连接不是 ACTIVE，按认证链接完成设置
4. 确认 ACTIVE 后运行工作流

## 工具发现
```
RUBE_SEARCH_TOOLS
queries: [{use_case: "MX Technologies operations", known_fields: ""}]
会话: {generate_id: true}
```

## 核心工作流模式
### 步骤 1：发现工具 -> 步骤 2：检查连接 -> 步骤 3：执行工具

## 已知陷阱
- 始终先搜索工具 架构
- 检查连接状态为 ACTIVE
- 使用 架构 合规的参数
- 始终包含 memory 参数
- 复用或生成会话 ID
- 检查分页

## 快速参考
| 操作 | 方法 |