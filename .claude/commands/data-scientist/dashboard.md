---
description: 设计完整分析仪表盘 — 多图表与KPI
argument-hint: "<describe the dashboard purpose and key metrics>"
---

# /dashboard — 仪表盘设计

设计并构建完整的分析仪表盘。

## 调用

```
/dashboard 包含 DAU、留存率、收入和功能采用率的产品指标仪表盘
/dashboard 增长团队的市场活动效果仪表盘
/dashboard 每周更新的高管 KPI 仪表盘
```

## 工作流

### 步骤 1：需求分析
明确目的、受众、更新频率和关键指标。

### 步骤 2：设计
应用 **build-dashboard** 技能——布局、图表选择、KPI 放置。

### 步骤 3：构建
生成实现代码（Streamlit、Plotly Dash 或 Panel），包含所有图表、筛选器和样式。

### 步骤 4：优化
应用 **style-guide** 实现一致、专业的样式。

提供后续选项：
- "想要**添加更多图表**或筛选器吗？"
- "需要我将其**部署为 Web 应用**吗？"
- "需要**连接到实时数据**源吗？"
