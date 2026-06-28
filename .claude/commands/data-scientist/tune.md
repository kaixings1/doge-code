---
description: 超参数优化工作流 — 网格、随机或贝叶斯搜索
argument-hint: "<describe your model and optimization goal>"
---

# /tune — Hyperparameter Tuning

Optimize model hyperparameters for better performance.

## Invocation

```
/tune Optimize my XGBoost model for AUC-ROC
/tune Find the best hyperparameters for this random forest classifier
/tune Bayesian optimization with 100 trials on my LightGBM model
```

## Workflow

Apply **hyperparameter-tuning** skill:
1. Define search space
2. Choose search strategy
3. Run optimization with cross-validation
4. Report best parameters and improvement

Offer follow-up:
- "Want to **evaluate the tuned model** in detail with /explain-model?"
- "Ready to **deploy** the final model with /deploy?"
