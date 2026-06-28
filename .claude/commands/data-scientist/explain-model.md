---
description: 模型可解释性与特征重要性 — SHAP、LIME、PDP
argument-hint: "<describe the model you want to explain>"
---

# /explain-model — Model Explanation

Explain model behavior globally and for individual predictions.

## Invocation

```
/explain-model Why did this customer get flagged as high churn risk?
/explain-model Generate SHAP plots for our loan approval model
/explain-model What features drive our revenue prediction model?
```

## Workflow

Apply **model-interpretation** skill:
1. Compute SHAP values
2. Generate global importance plots
3. Create local explanations for specific predictions
4. Write plain-language narrative for stakeholders

Offer follow-up:
- "Want to **present these findings** with /tell-story?"
- "Need to **improve the model** based on these insights?"
