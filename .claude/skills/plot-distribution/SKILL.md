---
name: 分布图
description: "创建分布可视化：直方图、KDE 图、箱线图、小提琴图、ECDF 和脊线图。适用于探索变量分布、比较跨组分布或检查正态性。"
---

# Plot Distribution

## Purpose
Visualize the distribution of numeric variables using the most appropriate chart type.

## How It Works

### Chart Types

| Chart | Best For | Code Library |
|-------|----------|--------------|
| **Histogram** | Single variable distribution, bin counts | matplotlib, seaborn |
| **KDE** | Smooth density estimation, overlaying groups | seaborn |
| **Box Plot** | Comparing distributions across groups, showing outliers | seaborn, plotly |
| **Violin Plot** | Distribution shape + summary stats across groups | seaborn |
| **ECDF** | Cumulative distribution, percentile analysis | seaborn, statsmodels |
| **Ridge/Joy Plot** | Many distributions side by side | joypy, plotly |
| **Strip/Swarm** | Individual points for small datasets | seaborn |
| **Rug Plot** | Marginal density along axes | seaborn |

### Configuration Options
- Number of bins (Sturges', Scott's, Freedman-Diaconis rules)
- Log scale for right-skewed data
- Overlay reference lines (mean, median, percentiles)
- Statistical annotations (normality test results, confidence intervals)
- Color by group for comparison
- Faceting by category (small multiples)

## Usage Examples

```
"Show the distribution of customer lifetime value, split by subscription plan"
```

```
"Create violin plots comparing response times across API endpoints"
```

## Output Format

- **Visualization Code**: matplotlib/seaborn/plotly implementation
- **Statistical Summary**: Mean, median, std, skewness alongside the plot
- **Insight**: Key observation about the distribution shape
