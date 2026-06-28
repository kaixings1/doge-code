---
description: 构建与诊断回归模型 — 线性、逻辑或正则化
argument-hint: "<describe outcome variable and predictors>"
---

# /regress — Regression Modeling

Build, diagnose, and interpret a regression model.

## Invocation

```
/regress Predict house prices from square footage, bedrooms, location
/regress [upload file] Run logistic regression to identify churn factors
/regress Build a LASSO model to find the most important revenue drivers
```

## Workflow

Apply **regression-analysis** skill:
1. Select model type based on outcome variable
2. Build model with appropriate features
3. Run full diagnostics (residuals, VIF, influence)
4. Interpret coefficients and generate predictions

Offer follow-up:
- "Want to **try ML models** for better prediction with /train-model?"
- "Should I **test specific coefficients** with /test-hypothesis?"
- "Need to **add interaction terms** or polynomial features?"
