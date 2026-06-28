---
name: 客户分析
description: "客户分析：客户生命周期价值 (CLV)、流失预测、RFM 细分、客户健康评分和 NPS 分析。适用于了解客户价值、预测流失或细分客户。"
---
# Customer Analytics

## Purpose
Understand customer value, predict churn risk, and segment customers for targeted actions.

## How It Works

### Customer Lifetime Value (CLV)
- **Historical CLV**: Sum of past revenue per customer
- **Predictive CLV**: BG/NBD + Gamma-Gamma model (probabilistic)
- **Simple CLV**: ARPU × Average Lifespan × Gross Margin

### RFM Segmentation
- **Recency**: Days since last purchase/activity
- **Frequency**: Number of purchases/sessions
- **Monetary**: Total spend or value generated
- Score each 1-5, create segments (Champions, At Risk, Lost, etc.)

### Churn Prediction
- Define churn (no activity in X days, subscription cancelled)
- Feature engineering from behavioral data
- Train classifier (XGBoost, logistic regression)
- Create risk tiers for proactive intervention

### Customer Health Score
- Composite metric: usage + satisfaction + support + value
- Weight by importance, normalize 0-100
- Set thresholds: healthy / at-risk / critical

## Usage Examples

```
"Calculate CLV and segment our customers using RFM analysis"
```

## Output Format

- **CLV Estimates**: Per customer and per segment
- **RFM Segments**: Labeled segments with profiles
- **Churn Risk**: Scored customers with risk tiers
- **Python Code**: lifetimes / sklearn implementation
