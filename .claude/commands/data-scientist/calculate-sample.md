---
description: 功效分析与实验样本量计算
argument-hint: "<baseline rate, minimum detectable effect, desired power>"
---

# /calculate-sample — Sample Size Calculator

Calculate the sample size needed for your experiment.

## Invocation

```
/calculate-sample Baseline conversion 3%, MDE 0.5%, power 80%
/calculate-sample How many users for an A/B test detecting 5% lift in retention?
/calculate-sample We have 10K daily visitors — how long to run this test?
```

## Workflow

Apply **sample-size-calculator** skill:
1. Clarify parameters (baseline, MDE, α, power)
2. Calculate required sample per group
3. Estimate test duration based on traffic
4. Generate sensitivity table (MDE × power matrix)

Offer follow-up:
- "Ready to **analyze test results** with /analyze-test?"
- "Want to **design the test** with proper randomization?"
