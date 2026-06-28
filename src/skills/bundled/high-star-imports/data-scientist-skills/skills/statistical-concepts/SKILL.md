---
name: statistical-concepts
description: "Reference guide to key statistical concepts: p-values, confidence intervals, effect sizes, multiple testing, statistical vs. practical significance, common misconceptions, and when to use parametric vs. non-parametric methods. Use when you need conceptual clarity or want to explain statistics to stakeholders."
---

# Statistical Concepts Reference

## Purpose
Quick reference for statistical concepts, common misconceptions, and practical guidance on choosing the right approach.

## Core Concepts

### P-Values
- **What it is**: Probability of observing data at least as extreme as yours, assuming H₀ is true
- **What it is NOT**: Probability that H₀ is true
- **Threshold**: p < 0.05 is convention, not law — consider context
- **Misconception**: A small p-value doesn't mean a large effect

### Confidence Intervals
- **What it is**: Range that would contain the true parameter 95% of the time if we repeated the study
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
|-----------|----------------|----------------|
| t-test | Mann-Whitney | Non-normal, ordinal data, small n |
| ANOVA | Kruskal-Wallis | Non-normal, outliers |
| Pearson r | Spearman ρ | Non-linear, ordinal |

## Usage Examples

```
"Explain the difference between statistical and practical significance
for my team presentation"
```

```
"I have 20 features to test — how do I control for multiple comparisons?"
```

## Output Format

- **Concept Explanation**: Clear, jargon-free description
- **Common Misconceptions**: What people get wrong
- **Decision Guide**: When to use what
- **Examples**: Real-world illustrations
