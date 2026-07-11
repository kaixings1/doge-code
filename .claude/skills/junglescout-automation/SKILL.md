---
name: Junglescout 自动化
description: "通过 Rube MCP (Composio) 自动执行 Junglescout 亚马逊选品和市场研究任务。"
risk: safe
source: community
date_added: "2026-03-06"
requires:
  mcp: [rube]
---
# Junglescout 自动化

通过 Composio 的 Junglescout 工具包和 Rube MCP 自动化 Junglescout 亚马逊选品和市场研究操作。

**工具包文档**：[composio.dev/toolkits/junglescout](https://composio.dev/toolkits/junglescout)

## 前提条件

- Rube MCP 必须已连接
- 通过相关连接工具建立 Junglescout 连接
- 始终先调用 RUBE_SEARCH_TOOLS

## 核心能力

- 产品数据库搜索和筛选
- 市场机会分析
- 竞品研究
- 关键词研究和趋势分析
- 销售估算和收入预测

## 核心工作流模式

### 步骤 1：发现可用工具

搜索当前可用的 Junglescout 工具和 schema。

### 步骤 2：检查连接

验证 Junglescout 连接状态。

### 步骤 3：执行工具

根据研究任务调用对应工具完成操作。

## 已知陷阱

- 始终先搜索：工具 schema 会变化
- 检查连接：验证连接状态
- 数据延迟：产品数据非实时更新
- API 限流：高频请求需控制频率

| 操作 | 说明 |
|---|---|
| 产品搜索 | 按品类、关键词、价格范围筛选 |
| 市场分析 | 竞品数量、平均价格、销售趋势 |
| 关键词研究 | 搜索量、竞争程度、相关词 |
| 产品估算 | 预估月销量、收入、评分 |
