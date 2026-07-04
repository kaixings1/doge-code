---
name: ML回归
description: "构建 ML 回归模型：梯度提升、随机森林、弹性网络、SVR 和 KNN 回归。包含模型比较、残差分析和预测区间。适用于使用复杂非线性关系预测连续结果。"
---

# ML Regression

## 目的
Build regression models using machine learning algorithms for problems where linear regression is insufficient.

## 工作原理

### 步骤 1: Baseline
- Simple linear regression as baseline metric
- Evaluate: RMSE, MAE, R², MAPE

### 步骤 2: Train ML Models
- **Elastic Net**: Regularized linear (handles multicollinearity)
- **Random Forest**: Non-linear, robust, feature importance
- **XGBoost/LightGBM**: Best accuracy on tabular data
- **SVR**: Kernel-based, good for small datasets
- Cross-validation with shuffled or time-based splits

### 步骤 3: Evaluate
- Metrics: RMSE, MAE, MAPE, R² on holdout set
- Residual analysis: patterns, heteroscedasticity
- Prediction intervals (quantile regression or conformal prediction)
- Learning curves for bias-variance diagnosis

### 步骤 4: Interpret
- Feature importance (SHAP, permutation, gain)
- Partial dependence plots
- Residual vs. predicted plots

## 用法 Examples

```
"Predict monthly revenue using marketing spend, seasonality, and market data"
```

```
"Build a house price estimator with prediction intervals"
```

## 输出格式

- **Model Comparison**: Metrics table across models
- **Best Model**: Hyperparameters and performance metrics
- **Feature Importance**: SHAP summary plot
- **Predictions**: With confidence/prediction intervals
- **Python Code**: sklearn / XGBoost pipeline
