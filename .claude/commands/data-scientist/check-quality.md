---
description: 数据质量审计评分卡 — 评估完整性、准确性、一致性、及时性、唯一性、有效性
argument-hint: "<describe your dataset or upload a file>"
---

# /check-quality — Data Quality Audit

Assess data quality across six dimensions and produce a quality scorecard.

## Invocation

```
/check-quality Audit this customer dataset before we use it for segmentation
/check-quality [upload file] How trustworthy is this data for financial reporting?
/check-quality Check the quality of our event tracking data
```

## Workflow

### Step 1: Load & Profile
Load the dataset and run initial profiling — shape, types, basic statistics.

### Step 2: Assess Quality Dimensions
Apply **validate-data-quality** skill across all six dimensions:
- Completeness, Accuracy, Consistency, Timeliness, Uniqueness, Validity

### Step 3: Generate Scorecard
Produce a color-coded scorecard with per-column and overall scores.

### Step 4: Remediation Plan
Prioritized fixes with Python code and effort estimates.

Offer follow-up:
- "Want to **fix these issues** with /clean?"
- "Should I **generate monitoring checks** (Great Expectations / Pandera)?"
- "Ready to **proceed to analysis** despite these issues?"
