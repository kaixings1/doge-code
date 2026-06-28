---
name: 模型监控
description: "监控已部署的 ML 模型：检测数据漂移、概念漂移、预测漂移和性能退化。设置告警和自动重训练触发器。适用于维护生产中的模型。"
---
# Model Monitoring

## Purpose
Detect when production models degrade and need retraining through drift detection and performance monitoring.

## How It Works

### Types of Drift

| Drift Type | What Changed | Detection |
|-----------|-------------|-----------|
| Data drift | Input feature distributions | KS test, PSI, KL divergence |
| Concept drift | Relationship between X and Y | Performance metric decay |
| Prediction drift | Model output distribution | PSI on predictions |
| Label drift | Target variable distribution | Chi-square, KS test |

### Monitoring Stack
- **Evidently AI**: Open-source drift detection and reporting
- **WhyLabs**: Managed monitoring platform
- **NannyML**: Performance estimation without labels
- **Custom**: Statistical tests on feature distributions

### Alert Design
- Threshold-based alerts (drift score > 0.1)
- Performance-based alerts (accuracy drops > 5%)
- Volume-based alerts (prediction count anomalies)
- Escalation: alert → investigate → retrain → deploy

## Usage Examples

```
"Set up drift monitoring for our churn prediction model"
```

```
"How do I detect concept drift when ground truth labels are delayed?"
```

## Output Format

- **Monitoring Plan**: What to track, thresholds, alert rules
- **Dashboard Design**: Key metrics and visualizations
- **Python Code**: Evidently / custom monitoring implementation
- **Retraining Trigger**: Automated retraining pipeline design
