---
name: ntomBuster 云平台
description: "通过 Composio 自动执行 PhantomBuster 云平台的潜在客户生成、网页抓取和社交媒体数据提取工作流"
requires:
  mcp:
    - rube
---

# PhantomBuster 自动化

自动化基于云的数据提取和潜在客户生成——管理代理和脚本、监控组织资源和使用情况、跟踪容器执行以及解决验证码挑战——全部通过 Composio MCP 集成编排。

**工具集文档:** [composio.dev/toolkits/phantombuster](https://composio.dev/toolkits/phantombuster)

## 先决条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 与工具集 `phantombuster` 建立活跃的连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**: 在客户端配置中添加 `https://rube.app/mcp` 作为 MCP 服务器。无需 API 密钥——只需添加端点即可使用。

1. 确认 `RUBE_SEARCH_TOOLS` 有响应以验证 Rube MCP 可用
2. 使用工具集 `phantombuster` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接状态不是 ACTIVE，按返回的认证链接完成设置
4. 在运行任何工作流前确认连接状态显示 ACTIVE

## 核心工作流模式

### 步骤 1：发现可用工具

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific PhantomBuster task"}]
会话: {id: "existing_session_id"}
```

### 步骤 2：检查连接

```
RUBE_MANAGE_CONNECTIONS
toolkits: ["phantombuster"]
session_id: "your_session_id"
```

### 步骤 3：执行工具

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

- **始终先搜索**: 工具 schema 会变化。未调用 `RUBE_SEARCH_TOOLS` 时绝不要硬编码工具 标识符 或参数
- **检查连接**: 执行工具前确认 `RUBE_MANAGE_CONNECTIONS` 显示 ACTIVE 状态
- **schema 合规**: 使用搜索结果中的精确字段名和类型
- **Memory 参数**: 始终在 `RUBE_MULTI_EXECUTE_TOOL` 调用中包含 `memory`，即使为空（`{}`）
- **会话复用**: 在工作流中复用会话 ID。新工作流生成新 ID
- **分页**: 检查响应中的分页令牌，持续获取直到完成