---
name: 样本量计算
description: "实验的功效分析和样本量计算：最小可检测效应、统计功效、显著性水平和持续时间估算。支持比例、均值和回归。适用于规划 A/B 测试、调查或任何需要足够样本量的研究。"
---

# Sample Size Calculator

## Purpose
Calculate the sample size needed for your experiment to detect a meaningful effect with adequate statistical power.

## How It Works

### Inputs
- **Baseline metric**: Current conversion rate, mean, or proportion
- **Minimum Detectable Effect (MDE)**: Smallest effect worth detecting
- **Significance level (α)**: Usually 0.05
- **Power (1-β)**: Usually 0.80 or 0.90
- **Test type**: One-sided or two-sided

### Formulas

**Two-proportion z-test** (A/B test on conversion):
```
n = (Z_{α/2} + Z_β)² × [p₁(1-p₁) + p₂(1-p₂)] / (p₁ - p₂)²
```

**Two-sample t-test** (comparing means):
```
n = (Z_{α/2} + Z_β)² × 2σ² / δ²
```

### Duration Estimation
- Daily traffic → days needed = total sample / daily traffic
- Account for weekday/weekend traffic variation
- Add 1-2 weeks for novelty/primacy effects

### Multiple Testing Correction
- Bonferroni: α_adjusted = α / number_of_tests
- Impact on required sample size
- Sequential testing alternatives (always-valid p-values)

## Usage Examples

```
"How many users do I need per group for an A/B test?
Baseline conversion is 3%, MDE is 0.5%, power 80%."
```

```
"We have 10K daily visitors. How long to run a test
detecting a 2% lift in signup rate?"
```

## Output Format

- **Sample Size**: Per group and total
- **Duration**: Estimated days based on traffic
- **Sensitivity Table**: Sample sizes for different MDE/power combinations
- **Python Code**: statsmodels power analysis implementation
