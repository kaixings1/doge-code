---
name: regression-ml
description: "Build ML regression models: gradient boosting, random forest, elastic net, SVR, and KNN regression. Includes model comparison, residual analysis, and prediction intervals. Use when predicting continuous outcomes with complex non-linear relationships."
---

# ML Regression

## Purpose
Build regression models using machine learning algorithms for problems where linear regression is insufficient.

## How It Works

### Step 1: Baseline
- Simple linear regression as baseline metric
- Evaluate: RMSE, MAE, R², MAPE

### Step 2: Train ML Models
- **Elastic Net**: Regularized linear (handles multicollinearity)
- **Random Forest**: Non-linear, robust, feature importance
- **XGBoost/LightGBM**: Best accuracy on tabular data
- **SVR**: Kernel-based, good for small datasets
- Cross-validation with shuffled or time-based splits

### Step 3: Evaluate
- Metrics: RMSE, MAE, MAPE, R² on holdout set
- Residual analysis: patterns, heteroscedasticity
- Prediction intervals (quantile regression or conformal prediction)
- Learning curves for bias-variance diagnosis

### Step 4: Interpret
- Feature importance (SHAP, permutation, gain)
- Partial dependence plots
- Residual vs. predicted plots

## Usage Examples

```
"Predict monthly revenue using marketing spend, seasonality, and market data"
```

```
"Build a house price estimator with prediction intervals"
```

## Output Format

- **Model Comparison**: Metrics table across models
- **Best Model**: Hyperparameters and performance metrics
- **Feature Importance**: SHAP summary plot
- **Predictions**: With confidence/prediction intervals
- **Python Code**: sklearn / XGBoost pipeline
