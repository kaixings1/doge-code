---
name: plot-comparison
description: "Create comparison visualizations: bar charts, grouped bar charts, lollipop charts, dot plots, small multiples, and dumbbell charts. Use when comparing values across categories, showing rankings, or highlighting differences."
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
