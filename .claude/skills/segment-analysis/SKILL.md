---
name: 分群分析
description: "发现自然数据段并分析组间差异：基于聚类的细分、交叉表、组间统计比较和细分画像。适用于寻找自然分组或比较子群体。"
---

# Segment Analysis

## Purpose
Discover natural segments in your data and characterize how groups differ. Combines unsupervised clustering with statistical comparison to reveal meaningful subpopulations.

## How It Works

### Step 1: Identify Segments
- **Predefined segments**: Analyze existing categories (e.g., by plan tier, region)
- **Data-driven segments**: Discover groups using K-means, DBSCAN, or hierarchical clustering
- Optimal cluster count via elbow method, silhouette score, gap statistic

### Step 2: Profile Each Segment
- Size: count and percentage of total
- Demographics: distribution of key features per segment
- Behavior: mean/median of behavioral metrics per segment
- Distinguishing features: what makes each segment unique

### Step 3: Compare Segments
- Statistical tests for group differences (ANOVA, Kruskal-Wallis, chi-squared)
- Effect sizes (Cohen's d, eta-squared)
- Pairwise post-hoc comparisons with multiple testing correction

### Step 4: Actionable Insights
- Name each segment with a descriptive label
- Rank segments by business value or analytical interest
- Recommend targeted actions per segment

## Usage Examples

```
"Segment our users based on engagement patterns and tell me
how each segment differs in conversion rate"
```

```
"Compare feature usage across free, pro, and enterprise tiers —
which features drive upgrades?"
```

## Output Format

- **Segment Profiles**: Descriptive summary of each segment
- **Comparison Table**: Side-by-side metrics with statistical significance
- **Visualizations**: Segment distributions, radar charts, parallel coordinates
- **Python Code**: Segmentation and profiling script
