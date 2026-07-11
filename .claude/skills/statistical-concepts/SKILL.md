---
name: 统计学概念
description: "关键统计概念的参考指南：p 值、置信区间、效应量、多重比较、统计显著性与实际显著性、常见误解以及何时使用参数与非参数方法。适用于需要概念清晰度或想向利益相关者解释统计数据时。"
---

# 统计概念

## 目的
快速参考 for statistical concepts, common misconceptions, and practical guidance on choosing the right 方法.

## 核心概念

### P-Values
- **What it is**: Probability of observing data at least as extreme as yours, assuming H₀ is true
- **What it is NOT**: Probability that H₀ is true
- **Threshold**: p < 0.05 is convention, not law — consider context
- **Misconception**: A small p-value doesn't mean a large effect

### Confidence Intervals
- **What it is**: Range that would contain the true 参数 95% of the time if we repeated the study
- **What it is NOT**: 95% probability the true value is in this specific interval
- **Practical use**: Width tells you precision; overlap tells you significance

### Effect Sizes
- **Cohen's d**: Small (0.2), Medium (0.5), Large (0.8)
- **r² / R²**: Proportion of variance explained
- **Odds Ratio**: >1 increases odds, <1 decreases odds
- **Rule**: Always report effect size alongside p-value

### Statistical vs. Practical Significance
- Large sample + tiny effect → statistically significant but meaningless
- Small sample + large effect → not significant but worth investigating
- Always ask: "Is this effect big enough to matter?"

### Multiple Testing
- Testing 20 hypotheses at α=0.05 → expect 1 false positive
- **Bonferroni**: Conservative but simple (α/m)
- **Benjamini-Hochberg**: Controls false discovery rate (preferred for exploration)

### Parametric vs. Non-Parametric

| Parametric | Non-Parametric | When to Switch |
