---
name: choose-chart
description: "Chart selection guide: match your data type, analytical question, and audience to the right visualization. Covers 30+ chart types with when-to-use guidelines, common mistakes, and alternatives. Use when deciding how to visualize data or when a chart doesn't feel right."
---

# Choose Chart

## Purpose
Select the most effective visualization for your data and message. Maps analytical questions to chart types, avoiding common visualization mistakes.

## How It Works

### Step 1: Identify the Analytical Question

| Question Type | Best Charts |
|--------------|-------------|
| **Distribution** — What does the spread look like? | Histogram, KDE, box plot, violin plot |
| **Comparison** — How do groups differ? | Bar chart, grouped bar, lollipop, dot plot |
| **Relationship** — How do variables relate? | Scatter plot, bubble chart, heatmap |
| **Composition** — What makes up the whole? | Stacked bar, treemap, pie (≤5 categories), waffle |
| **Trend** — How does it change over time? | Line chart, area chart, slope chart |
| **Ranking** — Which is biggest/smallest? | Horizontal bar, bump chart, slope chart |
| **Geospatial** — Where is it? | Choropleth, bubble map, hex map |
| **Flow** — How does it move? | Sankey, alluvial, funnel chart |
| **Part-to-whole over time** — How does composition change? | Stacked area, 100% stacked bar |

### Step 2: Consider Data Properties
- **Number of categories**: >7? Avoid pie charts, use bar charts
- **Data volume**: >10K points? Use hexbin, density, or aggregation
- **Dimensions**: >3? Use small multiples, parallel coordinates, or dimensionality reduction
- **Precision needed**: Tables beat charts for exact values

### Step 3: Audience Considerations
- **Executive**: Keep simple — bar charts, line charts, KPI cards
- **Analyst**: Can handle complex — heatmaps, pair plots, faceted charts
- **Public**: Familiar forms — bar, line, scatter with clear annotations

### Step 4: Common Mistakes to Avoid
- Dual y-axes (misleading scale comparisons)
- 3D charts (distorts perception)
- Rainbow color palettes (not perceptually uniform)
- Truncated y-axes (exaggerates differences)
- Pie charts with >5 slices (hard to compare)
- Chart junk (unnecessary decoration)

## Usage Examples

```
"I have monthly revenue by product category over 2 years.
What's the best way to show both trends and composition?"
```

```
"I need to present A/B test results to executives.
What chart type will make the difference clear?"
```

## Output Format

- **Recommendation**: Chart type with rationale
- **Alternatives**: 2-3 other options with trade-offs
- **Anti-patterns**: What NOT to use and why
- **Code Template**: matplotlib/seaborn/plotly starter code

---

### Further Reading

- Edward Tufte — *The Visual Display of Quantitative Information*
- Cole Nussbaumer Knaflic — *Storytelling with Data*
- [From Data to Viz](https://www.data-to-viz.com/) — Interactive chart selection tool
