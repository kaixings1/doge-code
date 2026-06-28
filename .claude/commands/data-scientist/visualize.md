---
description: 从数据问题生成正确的可视化
argument-hint: "<describe what you want to visualize>"
---

# /visualize — Smart Visualization

Describe what you want to see and get the right chart with polished styling.

## Invocation

```
/visualize Show the distribution of customer ages by subscription tier
/visualize [upload file] What's the trend in daily signups?
/visualize Compare conversion rates across our 5 marketing channels
```

## Workflow

### Step 1: Understand the Question
Parse the analytical question to determine: comparison, distribution, relationship, trend, or composition.

### Step 2: Select Chart
Apply **choose-chart** skill to pick the optimal visualization.

### Step 3: Generate Code
Apply the appropriate **plot-*** skill to produce the visualization with proper styling.

### Step 4: Style & Polish
Apply **style-guide** skill for publication-ready output.

Offer follow-up:
- "Want to **change the chart type** or adjust styling?"
- "Should I **add this to a dashboard** with /dashboard?"
- "Want to **build a narrative** around this with /tell-story?"
