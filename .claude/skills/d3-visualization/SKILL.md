---
name: d3-visualization
description: "D3 Visualization — D3 Visualization 相关功能和最佳实践"
  教导代理生成 D3 图表和交互式数据可视化。一个全面的 D3.js 技能，涵盖各种图表类型和技术的示例，赋予代理专家级知识以生成复杂的交互式可视化。适用于编辑仪表盘、报告、数据密集型原型和说明性图形。
triggers:
  - "d3"
  - "d3.js"
  - "interactive chart"
  - "data visualization"
  - "editorial chart"
  - "d3 bar chart"
  - "d3 line chart"
  - "d3 map"
  - "d3 force graph"
  - "d3 sankey"
  - "d3 treemap"
  - "d3 sunburst"
  - "d3 choropleth"
  - "d3 animation"
  - "d3 scroll"
  - "snow-d3"
od:
  mode: prototype
  category: diagrams
  upstream: "https://github.com/jiannanya/snow-d3/"
---

# d3-visualization

> Curated from @jiannanya.

## What it does

Teaches the agent to produce D3 charts and interactive data visualizations. A comprehensive D3.js skill with examples across chart types and techniques giving the agent expert-level knowledge to generate complex, interactive visualizations. Useful for editorial dashboards, reports, data-rich prototypes, and explanatory graphics.

## Source

- Upstream: https://github.com/jiannanya/snow-d3/
- Category: `diagrams`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and reference documents, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/jiannanya/snow-d3/

# Clone or copy the snow-d3/ folder into your workspace's skills/ directory
git clone https://github.com/jiannanya/snow-d3.git skills/snow-d3

```

Then ask the agent to invoke this skill by name (`d3-visualization`) or with
one of the trigger phrases listed in this skill's frontmatter, e.g.:

> "Create a zoomable treemap for my sales data"
> "Build a force-directed network graph like example 07 but for my own dataset"
> "Generate a calendar heatmap in D3"
