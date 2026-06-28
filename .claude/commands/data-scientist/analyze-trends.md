---
description: 时间序列趋势与季节性分析
argument-hint: "<describe your time-series data and what trends you want to analyze>"
---

# /analyze-trends — Trend Analysis

Analyze temporal patterns — trends, seasonality, changepoints, and growth rates.

## Invocation

```
/analyze-trends Analyze the trend in daily signups over the past year
/analyze-trends [upload file] Decompose monthly revenue into trend and seasonal components
/analyze-trends Is there a day-of-week pattern in our support ticket volume?
```

## Workflow

### Step 1: Time Series Preparation
Validate timestamps, detect frequency, handle gaps.

### Step 2: Decomposition
Apply **trend-analysis** skill — decompose into trend, seasonal, and residual.

### Step 3: Pattern Detection
Detect seasonality periods, changepoints, and anomalous time periods.

### Step 4: Growth Analysis
Calculate period-over-period growth, YoY comparisons, and CAGR.

### Step 5: Report

```
## Trend Analysis: [Metric Name]

**Period**: [start] to [end] | **Frequency**: [daily/weekly/monthly]
**Overall Trend**: [direction] at [X]% [growth rate type]

### Seasonality
- [Pattern description]

### Changepoints
- [Date]: [Description of change]

### Forecast Implications
- [What this means for future values]
```

Offer follow-up:
- "Want to **forecast** future values with /forecast?"
- "Should I **investigate a specific changepoint**?"
- "Want to **compare trends** across segments?"
