---
description: 时间序列预测工作流 — ARIMA、Prophet或指数平滑
argument-hint: "<describe your time series data and forecast horizon>"
---

# /forecast — Time Series Forecasting

Build and evaluate a time series forecast.

## Invocation

```
/forecast Forecast monthly revenue for the next 6 months
/forecast [upload file] Predict daily user signups with holiday effects
/forecast Build a demand forecast with seasonal adjustments
```

## Workflow

Apply **time-series-analysis** skill:
1. Assess stationarity and decompose into components
2. Select and fit the best model (ARIMA, Prophet, Holt-Winters)
3. Generate forecasts with confidence intervals
4. Evaluate on holdout set

Offer follow-up:
- "Want to **analyze trends** in more detail with /analyze-trends?"
- "Need a **causal analysis** of what's driving the trend?"
- "Should I **compare multiple models** side by side?"
