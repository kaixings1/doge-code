---
description: 因果推断分析 — 从观测数据估计处理效应
argument-hint: "<describe the treatment, outcome, and available data>"
---

# /causal — Causal Inference

Estimate causal effects when A/B tests aren't possible.

## Invocation

```
/causal Did our pricing change cause revenue to increase or was it seasonal?
/causal Estimate the causal impact of the loyalty program on retention
/causal [upload file] Use propensity score matching to estimate treatment effect
```

## Workflow

Apply **causal-inference** skill:
1. Frame the causal question and draw a DAG
2. Choose the appropriate method (DiD, PSM, RD, IV)
3. Check identifying assumptions
4. Estimate treatment effect with sensitivity analysis

Offer follow-up:
- "Want to **run a formal A/B test** instead? Use /calculate-sample for sizing."
- "Need to **estimate with different methods** for robustness?"
