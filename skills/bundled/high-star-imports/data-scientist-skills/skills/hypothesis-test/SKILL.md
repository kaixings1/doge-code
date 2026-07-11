---
name: hypothesis-test
description: "Choose and run the right statistical test: t-test, chi-square, Mann-Whitney, Wilcoxon, Fisher's exact, Kruskal-Wallis, McNemar, and more. Includes assumption checking, effect size calculation, and results interpretation. Use when comparing groups, testing independence, or validating claims with data."
---

# Hypothesis Test

## Purpose
Select the correct statistical test based on your data type, sample size, and research question. Runs the test with proper assumption checking and interprets results in plain language.

## How It Works

### Step 1: Identify the Question

| Research Question | Data Types | Test |
|-------------------|------------|------|
| Two group means differ? | Continuous, normal | Independent t-test |
| Two group means differ? | Continuous, non-normal | Mann-Whitney U |
| Before/after change? | Continuous, normal, paired | Paired t-test |
| Before/after change? | Continuous, non-normal, paired | Wilcoxon signed-rank |
| 3+ group means differ? | Continuous, normal | One-way ANOVA |
| 3+ group means differ? | Continuous, non-normal | Kruskal-Wallis |
| Variables independent? | Categorical × Categorical | Chi-square / Fisher's exact |
| Proportion differs from expected? | Binary | Binomial / Z-test for proportions |
| Two proportions differ? | Binary × 2 groups | Z-test for two proportions |
| Correlation exists? | Continuous × Continuous | Pearson / Spearman correlation test |

### Step 2: Check Assumptions
- **Normality**: Shapiro-Wilk test, QQ plot
- **Equal variance**: Levene's test, Bartlett's test
- **Independence**: Study design assessment
- **Sample size**: Minimum requirements per test
- If assumptions violated → recommend non-parametric alternative

### Step 3: Run the Test
- Calculate test statistic and p-value
- Compute effect size (Cohen's d, η², Cramér's V, odds ratio)
- Calculate confidence intervals
- Check statistical power

### Step 4: Interpret Results
- Statistical significance (p < α?)
- Practical significance (effect size interpretation)
- Confidence interval interpretation
- Limitations and caveats
- Plain-language conclusion

## Usage Examples

```
"Is there a significant difference in conversion rate between
our mobile and desktop users?"
```

```
"Test whether the new onboarding flow improved 7-day retention
compared to the control group"
```

## Output Format

```
## Hypothesis Test Results

**Test**: [Test name]
**H₀**: [Null hypothesis]
**H₁**: [Alternative hypothesis]

| Metric | Value |
|--------|-------|
| Test statistic | X.XX |
| p-value | 0.XXX |
| Effect size | X.XX ([interpretation]) |
| 95% CI | [lower, upper] |
| Power | XX% |

**Conclusion**: [Plain-language interpretation]
**Practical significance**: [Business meaning]
```

- **Python Code**: scipy.stats implementation
- **Assumption Check**: Test results for all prerequisites
