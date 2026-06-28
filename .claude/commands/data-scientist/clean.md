---
description: 完整数据清洗管道 — 检测问题、修复、验证结果
argument-hint: "<describe your dataset or upload a file>"
---

# /clean — Data Cleaning Pipeline

Detect, fix, and validate data quality issues in a single workflow. Chains cleaning skills into an end-to-end pipeline.

## Invocation

```
/clean This CSV has customer records with messy dates and missing emails
/clean [upload file] Prepare this dataset for a churn prediction model
/clean Fix duplicates and missing values in the attached sales data
```

## Workflow

### Step 1: Load & Assess

Load the dataset and run a comprehensive quality scan:
- Shape, dtypes, memory usage
- Missing values per column (count and percentage)
- Duplicate rows (exact and near-duplicates)
- Type inconsistencies and encoding issues
- Basic descriptive statistics

Present a summary table of all detected issues ranked by severity.

### Step 2: Create Cleaning Plan

For each detected issue, propose a fix:
- Missing values → imputation strategy (apply **handle-missing-data** skill)
- Duplicates → deduplication strategy
- Type errors → conversion logic
- Outliers → flag using **detect-outliers** skill (optional if user requests)
- Text issues → apply **parse-dates-text** skill

Present the plan and ask for confirmation before proceeding.

### Step 3: Execute Fixes

Apply **clean-dataset** skill to generate and execute cleaning code:
- Apply fixes in dependency order (types before imputations)
- Log every transformation
- Generate reproducible Python code

### Step 4: Validate & Report

Apply **validate-data-quality** skill:
- Before/after comparison
- Data quality scorecard
- Remaining issues (if any)

```
## Cleaning Report: [Dataset Name]

**Before**: [rows] rows × [cols] columns | [N] issues detected
**After**: [rows] rows × [cols] columns | [N] issues remaining

| Issue Type | Count Before | Count After | Action Taken |
|------------|-------------|-------------|--------------|
| Missing values | ... | ... | ... |
| Duplicates | ... | ... | ... |
| Type errors | ... | ... | ... |

**Quality Score**: [X]% → [Y]%
```

Offer follow-up:
- "Want to **explore the clean data** with /eda?"
- "Ready to **engineer features** with /engineer-features?"
- "Need to **save the cleaning script** for reuse on new batches?"
