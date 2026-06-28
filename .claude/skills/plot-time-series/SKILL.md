---
name: 时间序列图
description: "创建时间序列可视化：折线图、面积图、季节性分解图、迷你图和日历热力图。适用于展示随时间变化的趋势、比较时间模式或呈现预测结果。"
---

# Plot Time Series

## Purpose
Visualize temporal data with charts optimized for showing trends, seasonality, and changes over time.

## How It Works

### Chart Types

| Chart | Best For |
|-------|----------|
| **Line Chart** | Single or few time series, trend emphasis |
| **Area Chart** | Volume over time, stacked for composition |
| **Dual Axis** | Two series on different scales (use cautiously) |
| **Sparklines** | Inline trend indicators in tables/dashboards |
| **Calendar Heatmap** | Daily patterns over weeks/months |
| **Seasonal Plot** | Overlaid years/periods for pattern comparison |
| **Fan Chart** | Forecast with confidence intervals |
| **Decomposition** | Trend, seasonal, residual components |
| **Event Markers** | Annotated events on timeline |

### Enhancements
- Moving average overlay (smoothing noise)
- Confidence bands for uncertainty
- Event annotations (product launches, holidays)
- Highlight specific periods or anomalies
- Reference lines (targets, baselines, YoY)
- Secondary y-axis for context metrics

## Usage Examples

```
"Plot daily active users over the past year with a 7-day moving average
and annotate our product launches"
```

```
"Create a seasonal plot overlaying revenue for 2024, 2025, and 2026"
```

## Output Format

- **Visualization Code**: matplotlib/plotly implementation
- **Time Properties**: Frequency, range, gaps detected
- **Insight**: Key temporal pattern observation
