---
name: build-dashboard
description: "Design multi-chart analytical dashboards: layout planning, chart selection, KPI cards, filter design, and interactivity. Use when creating executive dashboards, operational monitoring views, or analytical workspaces."
---

# Build Dashboard

## Purpose
Design a complete analytical dashboard — layout, chart selection, KPI placement, and interaction design.

## How It Works

### Step 1: Define Dashboard Purpose
- **Strategic**: Executive-level KPIs, high-level trends (update: weekly/monthly)
- **Operational**: Real-time monitoring, alerts (update: minutes/hours)
- **Analytical**: Deep-dive exploration, self-service (update: on-demand)

### Step 2: Information Architecture
- **KPI cards**: Top-level metrics with trend indicators (top of dashboard)
- **Primary chart**: The most important visualization (largest, center)
- **Supporting charts**: Context, breakdowns, comparisons
- **Filters**: Time range, segments, dimensions (sidebar or top)
- **Details**: Tables, drill-down links (bottom)

### Step 3: Layout Patterns

```
┌────────────────────────────────────────────────────────┐
│  KPI 1  │  KPI 2  │  KPI 3  │  KPI 4  │  Filters ▼  │
├──────────────────────────────┬─────────────────────────┤
│                              │                         │
│     Primary Trend Chart      │   Breakdown by          │
│     (Line/Area)              │   Segment (Bar)         │
│                              │                         │
├──────────────────────────────┼─────────────────────────┤
│                              │                         │
│     Composition (Stacked)    │   Comparison (Grouped)  │
│                              │                         │
├──────────────────────────────┴─────────────────────────┤
│                    Detail Table                         │
└────────────────────────────────────────────────────────┘
```

### Step 4: Design Principles
- **Glanceable**: Key story visible in 5 seconds
- **Layered**: Overview first, details on demand (Shneiderman's mantra)
- **Consistent**: Same colors for same categories across charts
- **Minimal**: No chart junk, no redundant decorations
- **Responsive**: Works on desktop and tablet

### Step 5: Implementation
- Generate Python code (Plotly Dash, Streamlit, or Panel)
- Include layout, data loading, callbacks, and styling

## Usage Examples

```
"Design a product metrics dashboard with DAU, retention,
revenue, and feature adoption"
```

```
"Create a Streamlit dashboard for our marketing team
to track campaign performance"
```

## Output Format

- **Dashboard Blueprint**: Visual layout with chart placements
- **Chart Specifications**: Chart type, data source, and configuration for each
- **Implementation Code**: Plotly Dash / Streamlit / Panel code
- **Design Rationale**: Why each chart was chosen and placed

---

### Further Reading

- Stephen Few — *Information Dashboard Design*
- Ben Shneiderman — "Overview first, zoom and filter, then details-on-demand"
