---
name: distribution-analysis
description: "Analyze and fit statistical distributions: normality tests, distribution fitting, skewness and kurtosis interpretation, QQ plots, and distribution comparison. Use when assessing data normality, choosing statistical tests, or understanding data generating processes."
---

# Distribution Analysis

## Purpose
Characterize the statistical distribution of your data. Determines whether data is normal, identifies the best-fitting distribution, and provides the right statistical tools based on the distribution shape.

## How It Works

### Step 1: Visual Assessment
- Histogram with KDE overlay
- QQ plot against normal distribution
- Box plot with outlier markers
- ECDF (Empirical Cumulative Distribution Function)

### Step 2: Normality Testing
- Shapiro-Wilk test (best for n < 5000)
- D'Agostino-Pearson test (combines skewness and kurtosis)
- Anderson-Darling test (sensitive to tails)
- Kolmogorov-Smirnov test (general goodness-of-fit)

### Step 3: Distribution Fitting
Fit candidate distributions and rank by goodness-of-fit:
- Normal, Log-normal, Exponential, Gamma, Beta, Weibull, Poisson, Uniform
- AIC/BIC comparison across candidates
- Best-fit parameters with confidence intervals

### Step 4: Transformation Recommendations
If non-normal:
- Log transform (right-skewed data)
- Box-Cox transform (optimal power transform)
- Yeo-Johnson transform (handles negative values)
- Square root transform (count data)

### Step 5: Practical Implications
- Which statistical tests are appropriate (parametric vs. non-parametric)
- Impact on confidence intervals and hypothesis tests
- Modeling recommendations (GLM family choice, kernel selection)

## Usage Examples

```
"Is this revenue data normally distributed? What transformation should I apply?"
```

```
"Fit the best distribution to this event time data for simulation modeling"
```

## Output Format

- **Visual Summary**: Histogram, QQ plot, box plot
- **Test Results**: Normality test p-values with interpretation
- **Best Fit**: Distribution name, parameters, goodness-of-fit metrics
- **Transformation**: Recommended transform with before/after comparison
- **Python Code**: Reproducible analysis script
