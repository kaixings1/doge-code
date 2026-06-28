---
name: 关系图
description: "可视化变量间关系：散点图、配对图、热力图、气泡图和六边形图。适用于探索相关性、检查非线性关系或识别聚类。"
---

# Plot Relationship

## Purpose
Visualize how variables relate to each other, revealing correlations, clusters, and non-linear patterns.

## How It Works

### Chart Types

| Chart | Best For |
|-------|----------|
| **Scatter Plot** | Two continuous variables, up to ~1K points |
| **Hexbin / 2D Histogram** | Two continuous variables, large datasets (>1K) |
| **Pair Plot** | All pairwise relationships at once (up to ~10 variables) |
| **Heatmap** | Correlation matrix, cross-tabulations |
| **Bubble Chart** | Three variables (x, y, size) |
| **Joint Plot** | Scatter + marginal distributions |
| **Parallel Coordinates** | Many variables, cluster identification |
| **Andrews Curves** | Multivariate visualization, outlier detection |

### Enhancements
- Regression line with confidence band
- LOWESS smoothing for non-linear trends
- Color by category for group separation
- Size encoding for third variable
- Marginal distributions (rug/histogram/KDE)
- Annotate outliers and key points

## Usage Examples

```
"Create a scatter plot of price vs. sales quantity, colored by region,
with a trend line"
```

```
"Generate a pair plot for all numeric features, colored by cluster assignment"
```

## Output Format

- **Visualization Code**: matplotlib/seaborn/plotly implementation
- **Correlation Metric**: Pearson/Spearman coefficient with p-value
- **Insight**: Key relationship observation
