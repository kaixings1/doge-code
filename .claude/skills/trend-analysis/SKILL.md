---
name: 趋势分析
description: "检测和分析基于时间的趋势：季节性、变点、分解和增长率。适用于分析指标随时间的变化、检测结构性变化或理解周期性模式。"
---

# 趋势分析

## 目的
Identify, decompose, and interpret temporal patterns in your data — trends, seasonality, cyclicality, and structural changes.

## 工作原理

### 步骤 1: Time Series Profiling
- Frequency detection (daily, weekly, monthly, quarterly)
- Missing timestamps and gap analysis
- Stationarity testing (ADF test, KPSS test)

### 步骤 2: Decomposition
- **Additive decomposition**: Trend + Seasonal + Residual (stable seasonality)
- **Multiplicative decomposition**: Trend × Seasonal × Residual (growing seasonality)
- **STL decomposition**: Robust to outliers, flexible seasonal adjustment

### 步骤 3: Pattern Detection
- **Seasonality**: Day-of-week, monthly, quarterly, annual patterns
- **Changepoints**: Structural breaks in trend or variance (PELT, Bayesian)
- **Anomalies**: Time points that deviate significantly from the trend/season
- **Growth rate**: Period-over-period, YoY, CAGR

### 步骤 4: Interpretation
- What's driving the trend? (correlation with external events)
- Are seasonal patterns stable or evolving?
- What caused changepoints? (product launches, market events)

## 使用示例

```
"Analyze the trend in our daily active users over the past 12 months —
is there seasonality? Any structural changes?"
```

```
"Decompose our monthly revenue into trend and seasonal components"
```

## 输出格式

- **Trend Summary**: Direction, growth rate, confidence interval
- **Decomposition Charts**: Trend, seasonal, residual components
- **Changepoint Report**: Detected breaks with dates and magnitude
- **Seasonality Profile**: Pattern strength by period
- **Python Code**: Reproducible analysis script
