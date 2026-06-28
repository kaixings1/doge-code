---
name: 比较图
description: "创建比较可视化：条形图、分组条形图、棒棒糖图、点图、小倍数和哑铃图。适用于比较跨类别的值、显示排名或突出差异。"
---

# Plot Comparison

## Purpose
Compare values across categories with clear, effective charts.

## How It Works

### Chart Types

| Chart | Best For |
|-------|----------|
| **Vertical Bar** | Few categories (<7), comparing magnitudes |
| **Horizontal Bar** | Many categories, long labels, rankings |
| **Grouped Bar** | Comparing categories across 2-3 groups |
| **Stacked Bar** | Part-to-whole across categories |
| **Lollipop** | Cleaner alternative to bar charts |
| **Dot Plot** | Precise comparisons, multiple metrics |
| **Dumbbell** | Before/after or two-point comparisons |
| **Small Multiples** | Same chart repeated across categories |
| **Bump Chart** | Ranking changes over time |
| **Waterfall** | Sequential positive/negative contributions |

### Best Practices
- Sort bars by value (not alphabetically) unless there's a natural order
- Start y-axis at zero for bar charts
- Use horizontal bars when category labels are long
- Limit to 7 categories per chart — aggregate the rest into "Other"
- Add value labels for precise reading
- Use consistent colors — highlight the one category that matters

## Usage Examples

```
"Compare quarterly revenue across our 5 product lines"
```

```
"Show how customer satisfaction changed before and after the redesign,
broken down by user segment"
```

## Output Format

- **Visualization Code**: matplotlib/seaborn/plotly implementation
- **Design Notes**: Why this chart type was chosen over alternatives
- **Insight**: Key comparison highlighted
