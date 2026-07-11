---
name: anova-analysis
description: "Perform ANOVA analysis: one-way, two-way, repeated measures, ANCOVA, MANOVA. Includes assumption checking, post-hoc tests (Tukey, Bonferroni, Dunn), effect sizes, and non-parametric alternatives. Use when comparing means across 3+ groups."
---

# ANOVA Analysis

## Purpose
Compare means across multiple groups with proper statistical rigor, including assumption checking, post-hoc comparisons, and effect size reporting.

## How It Works

### Step 1: Choose ANOVA Type

| Design | Method |
|--------|--------|
| 1 factor, independent groups | One-way ANOVA |
| 1 factor, non-normal | Kruskal-Wallis |
| 2+ factors | Two-way / factorial ANOVA |
| Same subjects measured repeatedly | Repeated measures ANOVA |
| Controlling for a covariate | ANCOVA |
| Multiple dependent variables | MANOVA |

### Step 2: Check Assumptions
- Normality per group (Shapiro-Wilk)
- Homogeneity of variance (Levene's test)
- Independence of observations
- If violated → use Welch's ANOVA or Kruskal-Wallis

### Step 3: Run Analysis
- F-statistic and p-value
- Effect size: η² (eta-squared), partial η², ω² (omega-squared)
- If significant → proceed to post-hoc comparisons

### Step 4: Post-Hoc Tests
- **Tukey HSD**: All pairwise comparisons (balanced designs)
- **Bonferroni**: Conservative, any design
- **Dunn's test**: Non-parametric post-hoc after Kruskal-Wallis
- **Games-Howell**: Unequal variances

### Step 5: Interpret
- Which groups differ significantly?
- Effect sizes for each comparison
- Visualization: box plots with significance brackets

## Usage Examples

```
"Compare average session duration across 4 user segments"
```

```
"Test if conversion rate differs by landing page variant (A, B, C, D)"
```

## Output Format

- **ANOVA Table**: SS, df, MS, F, p, η²
- **Post-Hoc Comparisons**: Pairwise tests with adjusted p-values
- **Visualization**: Annotated box plots with significance markers
- **Python Code**: scipy / statsmodels / pingouin implementation
