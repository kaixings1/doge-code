---
description: 端到端数据转换工作流 — 重塑、合并、聚合
argument-hint: "<describe the transformation you need>"
---

# /wrangle — Data Transformation Workflow

Transform, reshape, and restructure your data step by step.

## Invocation

```
/wrangle Convert this wide-format survey data to long format for analysis
/wrangle Merge these three tables and create monthly aggregations
/wrangle [upload file] Reshape this for a time-series analysis
```

## Workflow

### Step 1: Understand Requirements
- What is the current data structure?
- What is the desired output structure?
- What tool? (pandas, polars, SQL)

### Step 2: Design Transformation
Apply **transform-data** skill to design the transformation sequence:
- Map current columns to target structure
- Identify reshaping operations needed (pivot, melt, join, aggregate)
- Handle edge cases (nulls from joins, duplicate keys, type conflicts)

### Step 3: Generate & Execute Code
- Produce commented, production-ready code
- Show intermediate results at each step
- Validate output shape and content

### Step 4: Validate
- Confirm row counts are expected (especially after joins)
- Check for introduced nulls
- Verify aggregation correctness with spot checks

Offer follow-up:
- "Want to **visualize** the transformed data?"
- "Ready for **exploratory analysis** with /eda?"
- "Need to **export** in a specific format?"
