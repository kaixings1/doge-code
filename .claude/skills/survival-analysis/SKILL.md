---
name: 生存分析
description: "生存分析和时间-事件分析：Kaplan-Meier 曲线、log-rank 检验、Cox 比例风险模型、风险函数和删失处理。适用于分析存在删失数据时的事件发生时间（流失、故障、转化）。"
---

# Survival Analysis

## Purpose
Analyze time-to-event data with proper handling of censoring. Common applications: customer churn, subscription duration, time to conversion, mechanical failure analysis.

## How It Works

### Step 1: Prepare Data
- Define event (churn, conversion, failure) and censoring (still active, lost to follow-up)
- Calculate duration: time from entry to event or censoring
- Validate: no negative durations, reasonable timeframes

### Step 2: Non-Parametric Analysis
- **Kaplan-Meier estimator**: Survival curves with confidence bands
- **Log-rank test**: Compare survival between groups
- **Median survival time**: When 50% of subjects have experienced the event

### Step 3: Semi-Parametric Modeling
- **Cox Proportional Hazards**: Model hazard as a function of covariates
- Check proportional hazards assumption (Schoenfeld residuals)
- Hazard ratios with confidence intervals
- Time-varying covariates if needed

### Step 4: Interpretation
- Survival probability at specific time points
- Hazard ratios: which factors increase/decrease risk
- Expected remaining lifetime for active subjects
- Business recommendations based on risk factors

## Usage Examples

```
"Analyze customer churn: how long do free-trial users last before churning?
Compare survival by acquisition channel."
```

```
"Build a Cox model to identify factors predicting subscriber churn —
include plan type, usage frequency, and support tickets."
```

## Output Format

- **Kaplan-Meier Curves**: Survival plots with confidence bands
- **Cox Model Summary**: Hazard ratios, CIs, p-values
- **Risk Factors**: Ranked by impact on survival
- **Python Code**: lifelines implementation
