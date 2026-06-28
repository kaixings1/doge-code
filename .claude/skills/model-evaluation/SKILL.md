---
name: 模型评估
description: "评估 ML 模型性能：分类指标（准确率、AUC、F1）、回归指标（RMSE、MAE、R²）、交叉验证策略、学习曲线、混淆矩阵、校准和公平性指标。适用于评估模型质量或比较模型。"
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
