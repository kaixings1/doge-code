---
description: 完整EDA工作流 — 剖析、可视化、提取洞察
argument-hint: "<describe your dataset or upload a file>"
---

# /eda — Exploratory Data Analysis

Run a complete EDA pipeline on your data: profiling → visualization → insights.

## Invocation

```
/eda [upload file] Run full exploratory analysis on this dataset
/eda Profile this sales data — the target variable is revenue
/eda Explore this dataset, I'm looking for patterns in user behavior
```

## Workflow

### Step 1: Profile
Apply **eda-profile** skill — structure, types, nulls, basic statistics.

### Step 2: Distributions
Apply **distribution-analysis** and **summary-statistics** skills — understand each variable.

### Step 3: Relationships
Apply **correlation-analysis** skill — identify feature relationships and multicollinearity.

### Step 4: Patterns & Anomalies
Apply **segment-analysis** and **anomaly-detection** skills — find groups and outliers.

### Step 5: Synthesize Insights

```
## EDA Summary: [Dataset Name]

**Shape**: [rows] × [cols] | **Quality**: [score]%

### Key Findings
1. [Most important insight]
2. [Second insight]
3. [Third insight]

### Data Quality Issues
- [Issues found]

### Recommended Next Steps
- [What to do next]
```

Offer follow-up:
- "Want to **clean the data** with /clean?"
- "Ready to **visualize specific findings** with /visualize?"
- "Want to **analyze trends over time** with /analyze-trends?"
- "Ready to **build a model** with /train-model?"
