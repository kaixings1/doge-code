---
name: customer-analytics
description: "Customer analytics: Customer Lifetime Value (CLV), churn prediction, RFM segmentation, customer health scoring, and NPS analysis. Use when understanding customer value, predicting churn, or segmenting customers."
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
