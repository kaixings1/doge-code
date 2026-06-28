---
name: 探索性数据分析
description: "自动化探索性数据分析画像：一次完成分布、缺失模式、相关性、数据类型和汇总统计。适用于开始分析新数据集或需要快速全面概览时。"
---

# EDA Profile

## Purpose
Generate a comprehensive exploratory data analysis profile in a single pass. Provides the complete picture of a dataset's structure, quality, and statistical properties.

## How It Works

### Step 1: Structure Overview
- Shape (rows × columns), memory usage
- Column names, data types, and inferred semantic types
- Identify: numeric, categorical, datetime, boolean, text, ID columns
- Sample rows (first, last, random)

### Step 2: Univariate Analysis
For each column based on type:
- **Numeric**: mean, median, std, min, max, quartiles, skewness, kurtosis, histogram
- **Categorical**: unique count, top categories, frequency distribution, bar chart
- **DateTime**: range, gaps, frequency, time distribution
- **Boolean**: true/false ratio
- **Text**: length distribution, word count, common patterns

### Step 3: Missing Data Profile
- Missing count and percentage per column
- Missing data patterns (which columns are missing together)
- Missingness mechanism hypothesis (MCAR/MAR/MNAR)

### Step 4: Bivariate Analysis
- Correlation matrix (Pearson for numeric, Cramér's V for categorical)
- Top correlated pairs highlighted
- Potential multicollinearity flags (|r| > 0.8)
- Target variable relationships (if specified)

### Step 5: Data Quality Flags
- Constant or near-constant columns
- High cardinality categoricals (potential ID columns)
- Potential data leakage indicators
- Suspicious distributions (uniform IDs that should be sequential, etc.)

### Step 6: Key Insights Summary
- Top 5 findings that need attention
- Recommended next steps (cleaning, transformation, modeling)

## Usage Examples

**Example 1: New dataset**
```
"Profile this dataset — I just received it and don't know what's in it"
```

**Example 2: Pre-modeling**
```
"Run EDA on this dataset before I build a prediction model.
The target variable is 'churn'."
```

## Output Format

- **Structure Summary**: Table of columns with types, nulls, unique counts
- **Statistical Profile**: Descriptive statistics per column
- **Visualizations**: Histograms, bar charts, correlation heatmap
- **Quality Flags**: Issues ranked by severity
- **Key Insights**: Top findings and recommended actions
- **Python Code**: Reproducible profiling script
