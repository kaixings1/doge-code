---
name: 异常值检测
description: "统计和基于 ML 的异常值检测：IQR 方法、Z-score、修正 Z-score、Isolation Forest、DBSCAN 和局部异常因子。适用于调查异常、在建模前清理数据或构建异常检测系统。"
---

# Detect Outliers

## Purpose
Identify anomalous data points using a combination of statistical and machine learning methods. Determines whether outliers are errors to remove, interesting signals to investigate, or natural variation to keep.

## How It Works

### Step 1: Univariate Detection
- **IQR Method**: Flag points outside Q1 - 1.5×IQR to Q3 + 1.5×IQR
- **Z-Score**: Flag points >3 standard deviations from the mean
- **Modified Z-Score**: Use MAD (Median Absolute Deviation) for robustness against skewed data
- **Percentile-Based**: Flag extreme percentiles (1st/99th or custom thresholds)

### Step 2: Multivariate Detection
- **Isolation Forest**: Tree-based anomaly detection — isolates outliers in fewer splits
- **Local Outlier Factor (LOF)**: Density-based — compares local density to neighbors
- **DBSCAN**: Cluster-based — points not assigned to any cluster are anomalies
- **Mahalanobis Distance**: Accounts for correlations between features

### Step 3: Contextual Analysis
- Are outliers clustered in time? → Possible data collection issues
- Are outliers associated with specific categories? → Segment-specific behavior
- Do outliers have domain meaning? → e.g., Black Friday sales spikes are real
- Are outliers influential on model results? → Cook's distance, leverage plots

### Step 4: Treatment Recommendation

| Scenario | Action |
|----------|--------|
| Data entry error | Remove or correct |
| Measurement error | Remove or flag |
| Natural extreme value | Keep — consider robust methods |
| Interesting signal | Investigate further — separate analysis |
| Model-influential | Winsorize or use robust estimators |

### Step 5: Generate Code
- Python code for detection (scipy, sklearn, pyod)
- Visualization: box plots, scatter plots with outliers highlighted
- Before/after comparison with impact on summary statistics

## Usage Examples

**Example 1: Sales data**
```
"Flag outliers in our daily revenue data — I suspect some data entry
errors but also want to catch genuine anomalies like flash sales"
```

**Example 2: ML preprocessing**
```
"I'm building a regression model. Which outlier detection method should
I use, and should I remove or winsorize the outliers?"
```

**Example 3: Multivariate**
```
"Detect multivariate outliers in this customer behavior dataset —
individual features look normal but some combinations are suspicious"
```

## Output Format

- **Outlier Report**: Count and percentage flagged per method
- **Visualization**: Annotated plots showing detected outliers
- **Classification**: Each outlier categorized (error / natural / signal)
- **Treatment Plan**: Recommended action per outlier group
- **Python Code**: Reproducible detection and treatment pipeline
