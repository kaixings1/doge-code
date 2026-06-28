---
name: model-evaluation
description: "Evaluate ML model performance: classification metrics (accuracy, AUC, F1), regression metrics (RMSE, MAE, R²), cross-validation strategies, learning curves, confusion matrices, calibration, and fairness metrics. Use when assessing model quality or comparing models."
---

# Model Evaluation

## Purpose
Rigorously evaluate model performance using appropriate metrics, cross-validation, and diagnostic tools.

## How It Works

### Classification Metrics

| Metric | When to Use | Formula |
|--------|-------------|---------|
| Accuracy | Balanced classes | (TP+TN) / Total |
| Precision | Minimize false positives | TP / (TP+FP) |
| Recall | Minimize false negatives | TP / (TP+FN) |
| F1 Score | Balance precision & recall | 2×P×R / (P+R) |
| AUC-ROC | Overall ranking quality | Area under ROC curve |
| AUC-PR | Imbalanced classes | Area under Precision-Recall |
| Log Loss | Probability calibration | Cross-entropy loss |

### Regression Metrics

| Metric | When to Use |
|--------|-------------|
| RMSE | Penalize large errors |
| MAE | Robust to outliers |
| MAPE | Percentage error, interpretable |
| R² | Proportion of variance explained |
| Adjusted R² | Account for number of features |

### Diagnostic Tools
- **Confusion Matrix**: Per-class TP/FP/TN/FN
- **ROC Curve**: Trade-off sensitivity vs. specificity
- **Precision-Recall Curve**: Better for imbalanced data
- **Learning Curves**: Detect underfitting/overfitting
- **Calibration Curve**: Probability reliability
- **Lift/Gain Chart**: Business value assessment

### Cross-Validation
- K-fold, stratified, time-series split, group K-fold
- Nested CV for unbiased model selection
- Bootstrap .632+ for small datasets

## Usage Examples

```
"Evaluate my churn model — the data is 95%/5% imbalanced.
Which metrics should I focus on?"
```

```
"Compare these 3 models and tell me which is best for production"
```

## Output Format

- **Metrics Summary**: Table with all relevant metrics
- **Diagnostic Plots**: ROC, PR, confusion matrix, calibration
- **Model Comparison**: Side-by-side if multiple models
- **Recommendation**: Best model with rationale
- **Python Code**: sklearn metrics implementation
