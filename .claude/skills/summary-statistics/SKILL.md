---
name: 汇总统计
description: "计算和解释描述性统计：集中趋势、离散度、形状和置信区间。超越 pandas .describe()，提供统计解释和上下文含义。适用于需要数据的全面统计摘要时。"
---

# 总结 Statistics

## Purpose
Provide a comprehensive statistical summary with interpretation — not just numbers, but what they mean for your analysis.

## How It Works

### Step 1: Central Tendency
- Mean, median, mode — and which is most appropriate for this distribution
- Trimmed mean (robust to outliers)
- Weighted mean (if weights are provided)

### Step 2: Dispersion
- Standard deviation, variance, coefficient of variation
- IQR, range, MAD (Median Absolute Deviation)
- Confidence intervals for the mean (95% CI)

### Step 3: Shape
- Skewness (with interpretation: symmetric, right-skewed, left-skewed)
- Kurtosis (with interpretation: leptokurtic, mesokurtic, platykurtic)
- Normality tests: Shapiro-Wilk, D'Agostino-Pearson, Anderson-Darling

### Step 4: Percentiles & Distribution
- Full percentile breakdown (1, 5, 10, 25, 50, 75, 90, 95, 99)
- Five-number summary with box plot
- Distribution fitting: identify the best-fitting distribution

### Step 5: Group Comparisons (if applicable)
- Statistics by category or time period
- Effect sizes between groups (Cohen's d, Cliff's delta)
- Statistical significance of group differences

## 用法 Examples

```
"Calculate summary statistics for the conversion_rate column,
grouped by marketing channel"
```

```
"Is this revenue data normally distributed? Which summary statistic
should I report — mean or median?"
```

## Output Format

- **Statistics Table**: Full descriptive statistics with 95% CIs
- **Interpretation**: Plain-language explanation of what the numbers mean
- **Distribution Assessment**: Normality test results with recommendation
- **Python Code**: Reproducible computation script
