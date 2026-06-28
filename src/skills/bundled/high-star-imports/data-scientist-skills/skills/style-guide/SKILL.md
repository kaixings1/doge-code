---
name: style-guide
description: "Data visualization style guide: color palettes, typography, accessibility (WCAG), publication-ready formatting, and consistent theming. Use when polishing charts for presentation, ensuring accessibility, or creating a consistent visual identity for your analytics."
---

# Style Guide

## Purpose
Apply professional, accessible, publication-ready styling to any data visualization.

## How It Works

### Color Palettes

**Sequential** (ordered data): Blues, Viridis, Magma
**Diverging** (above/below center): RdBu, Coolwarm, Spectral
**Categorical** (distinct groups): Tab10, Set2, custom brand palette
**Semantic** (meaning-mapped): Green=good, Red=bad, Gray=neutral

**Rules:**
- Maximum 7 colors per chart
- Colorblind-safe palettes (avoid pure red-green)
- Sufficient contrast ratio (WCAG AA: 4.5:1)
- Consistent mapping across all charts

### Typography
- **Title**: 16-18pt, bold, sentence case — state the insight
- **Axis labels**: 11-12pt, plain — clear and abbreviated
- **Annotations**: 10-11pt, italic — explain notable points
- **Source**: 8-9pt, gray — data source and date
- Font recommendations: Inter, Roboto, Source Sans Pro

### Layout & Spacing
- Aspect ratios: 16:9 for presentations, 4:3 for reports, 1:1 for social
- White space: minimum 10% margins
- Grid alignment: charts on consistent baselines
- Legend: inside chart area when possible, external when not

### Accessibility
- Alt text for all charts
- Pattern fills in addition to colors
- Sufficient font sizes (minimum 10pt)
- High contrast (avoid light gray on white)
- Screen reader-friendly data tables alongside charts

### Export Formats
- **Presentations**: PNG at 300 DPI, SVG for scalability
- **Reports**: PDF vector graphics
- **Web**: SVG or interactive HTML (Plotly)
- **Print**: CMYK color space, 300+ DPI

## Usage Examples

```
"Apply a professional dark theme to this matplotlib chart for a keynote"
```

```
"Make this chart colorblind-accessible and add proper annotations"
```

## Output Format

- **Style Configuration**: matplotlib rcParams / seaborn theme / plotly template
- **Python Code**: Theme application code
- **Before/After**: Visual comparison showing improvements
- **Checklist**: Accessibility and quality checks passed
