---
name: 仪表盘构建
description: "设计多图表分析仪表盘：布局规划、图表选择、KPI 卡片、过滤器设计、交互性。用于创建高管仪表盘、运营监控视图或分析工作区。"
---

# Build Dashboard

## 目的
Design a complete analytical dashboard — layout, chart selection, KPI placement, and interaction design.

## 工作原理

### 步骤 1: Define Dashboard Purpose
- **Strategic**: Executive-level KPIs, high-level trends (update: weekly/monthly)
- **Operational**: Real-time monitoring, alerts (update: minutes/hours)
- **Analytical**: Deep-dive exploration, self-service (update: on-demand)

### 步骤 2: Information 架构
- **KPI cards**: Top-level metrics with trend indicators (top of dashboard)
- **Primary chart**: The most important visualization (largest, center)
- **Supporting charts**: 上下文, breakdowns, comparisons
- **Filters**: Time range, segments, dimensions (sidebar or top)
- **Details**: Tables, drill-down links (bottom)

### 步骤 3: Layout Patterns

```
┌────────────────────────────────────────────────────────┐
│  KPI 1  │  KPI 2  │  KPI 3  │  KPI 4  │  Filters ▼  │
├──────────────────────────────┬─────────────────────────┤
│                              │                         │
│     Primary Trend Chart      │   Breakdown by          │
│     (Line/Area)              │   Segment (Bar)         │
│                              │                         │
├──────────────────────────────┼─────────────────────────┤
│                              │                         │
│     Composition (Stacked)    │   Comparison (Grouped)  │
│                              │                         │
├──────────────────────────────┴─────────────────────────┤
│                    Detail Table                         │
└────────────────────────────────────────────────────────┘
```

### 步骤 4: Design Principles
- **Glanceable**: Key story visible in 5 seconds
- **Layered**: 概述 first, details on demand (Shneiderman's mantra)
- **Consistent**: Same colors for same categories across charts
- **Minimal**: No chart junk, no redundant decorations
- **Responsive**: Works on desktop and tablet

### 步骤 5: Implementation
- Generate Python code (Plotly Dash, Streamlit, or Panel)
- Include layout, data loading, callbacks, and styling

## 用法 Examples

```
"Design a product metrics dashboard with DAU, retention,
revenue, and feature adoption"
```

```
"Create a Streamlit dashboard for our marketing team
to track campaign performance"
```

## 输出格式

- **Dashboard Blueprint**: Visual layout with chart placements
- **Chart Specifications**: Chart type, data source, and configuration for each
- **Implementation Code**: Plotly Dash / Streamlit / Panel code
- **Design Rationale**: Why each chart was chosen and placed

---

### Further Reading

- Stephen Few — *Information Dashboard Design*
- Ben Shneiderman — "概述 first, zoom and filter, then details-on-demand"
