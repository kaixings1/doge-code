---
name: trend-analysis
description: "Detect and analyze time-based trends: seasonality, changepoints, decomposition, and growth rates. Use when analyzing metrics over time, detecting structural changes, or understanding periodic patterns."
---

# Trend Analysis

## Purpose
Identify, decompose, and interpret temporal patterns in your data — trends, seasonality, cyclicality, and structural changes.

## How It Works

### Step 1: Time Series Profiling
- Frequency detection (daily, weekly, monthly, quarterly)
- Missing timestamps and gap analysis
- Stationarity testing (ADF test, KPSS test)

### Step 2: Decomposition
- **Additive decomposition**: Trend + Seasonal + Residual (stable seasonality)
- **Multiplicative decomposition**: Trend × Seasonal × Residual (growing seasonality)
- **STL decomposition**: Robust to outliers, flexible seasonal adjustment

### Step 3: Pattern Detection
- **Seasonality**: Day-of-week, monthly, quarterly, annual patterns
- **Changepoints**: Structural breaks in trend or variance (PELT, Bayesian)
- **Anomalies**: Time points that deviate significantly from the trend/season
- **Growth rate**: Period-over-period, YoY, CAGR

### Step 4: Interpretation
- What's driving the trend? (correlation with external events)
- Are seasonal patterns stable or evolving?
- What caused changepoints? (product launches, market events)

## Usage Examples

```
"Analyze the trend in our daily active users over the past 12 months —
is there seasonality? Any structural changes?"
```

```
"Decompose our monthly revenue into trend and seasonal components"
```

## Output Format

- **Trend Summary**: Direction, growth rate, confidence interval
- **Decomposition Charts**: Trend, seasonal, residual components
- **Changepoint Report**: Detected breaks with dates and magnitude
- **Seasonality Profile**: Pattern strength by period
- **Python Code**: Reproducible analysis script
