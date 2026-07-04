---
name: 漏斗分析
description: "分析转化漏斗：各步骤流失率、瓶颈识别、分群对比及优化建议。适用于分析用户流程、结账流程或新手引导序列。"
---
# Funnel Analysis

## 目的
Analyze step-by-step conversion funnels to identify where users drop off and why.

## 工作原理

### 步骤 1: Define Funnel Steps
- List sequential steps (e.g., landing → signup → activation → purchase)
- Define conversion events for each step
- Set time window for step completion

### 步骤 2: Calculate Metrics
- Step-by-step conversion rate
- Overall funnel conversion
- Drop-off rate at each step
- Time between steps (median, percentiles)

### 步骤 3: Segment Analysis
- Compare funnels across segments (device, channel, user type)
- Identify segments with highest/lowest conversion
- Find step-specific segment differences

### 步骤 4: Recommendations
- Prioritize by impact: biggest drop-off × easiest to fix
- Suggest A/B tests for friction points
- Benchmark against industry standards

## 使用示例

```
"Analyze our signup → onboarding → first purchase funnel by acquisition channel"
```

## 输出格式

- **Funnel Visualization**: Bar/funnel chart with drop-off rates
- **Step Metrics**: Conversion and drop-off per step
- **Segment Comparison**: Side-by-side funnels
- **Recommendations**: Prioritized optimization opportunities
