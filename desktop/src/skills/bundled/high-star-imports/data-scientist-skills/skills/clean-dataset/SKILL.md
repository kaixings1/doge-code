---
name: clean-dataset
description: "Detect and fix common data quality issues: missing values, duplicates, type mismatches, encoding problems, and inconsistent formats. Use when starting a new analysis, preparing data for modeling, or auditing a dataset for issues."
---

# Clean Dataset

## Purpose
Systematically identify and resolve data quality issues in any tabular dataset. This skill provides a structured cleaning pipeline that handles the most common problems analysts encounter.

## How It Works

### Step 1: Initial Assessment
- Load the dataset and display shape, dtypes, and first/last rows
- Calculate the percentage of missing values per column
- Identify duplicate rows (exact and near-duplicates)
- Check for mixed data types within columns
- Detect encoding issues (mojibake, special characters)

### Step 2: Missing Value Analysis
- Classify missing data mechanism: MCAR, MAR, or MNAR
- Visualize missing patterns (nullity matrix)
- Recommend strategy per column:
  - **Drop**: >60% missing or not analytically useful
  - **Fill (simple)**: Median for numeric, mode for categorical, forward-fill for time series
  - **Impute (advanced)**: KNN or MICE when relationships exist between features
- Generate Python code for each fix

### Step 3: Duplicate Detection & Resolution
- Identify exact duplicates
- Find near-duplicates using fuzzy matching on key columns
- Recommend: keep first, keep last, or aggregate
- Generate deduplication code

### Step 4: Type Correction & Standardization
- Convert string numbers to numeric (handling locale-specific formats)
- Parse date strings into datetime objects
- Standardize categorical values (case, whitespace, typos)
- Convert boolean-like strings to actual booleans
- Detect and fix encoding issues (UTF-8 normalization)

### Step 5: Validation & Report
- Re-run initial assessment to confirm fixes
- Generate a before/after comparison summary
- Produce a cleaning log documenting every transformation
- Suggest next steps (EDA, feature engineering)

## Usage Examples

**Example 1: CSV with mixed issues**
```
Upload your dataset and say:
"Clean this dataset — it has missing values, some duplicate customer records,
and the date columns are in different formats"
```

**Example 2: Automated pipeline**
```
"Generate a reusable Python cleaning script for this data schema
that I can run on new data batches"
```

**Example 3: Focused cleaning**
```
"Just fix the missing values in the revenue and churn columns —
don't touch anything else"
```

## Key Capabilities

- **Multi-format support**: CSV, Excel, Parquet, JSON, SQL query results
- **Automated detection**: Finds issues without manual inspection
- **Code generation**: Produces pandas/polars code for reproducibility
- **Logging**: Documents every change for audit trails
- **Batch-ready**: Generates reusable scripts for recurring data pipelines

## Tips for Best Results

1. **Upload the actual data** or paste a sample — real data reveals real problems
2. **Mention known issues** — if you know certain columns are problematic, say so
3. **Specify priorities** — tell me which columns matter most for your analysis
4. **State the end goal** — cleaning for a dashboard is different from cleaning for ML

## Output Format

You'll receive:
- **Issue Report**: Summary of all detected problems with severity ratings
- **Cleaning Plan**: Recommended fix for each issue with rationale
- **Python Code**: Ready-to-run pandas/polars code implementing all fixes
- **Validation Summary**: Before/after comparison confirming improvements
- **Cleaning Log**: Audit trail of all transformations applied

---

### Further Reading

- Hadley Wickham — [Tidy Data](https://vita.had.co.nz/papers/tidy-data.pdf)
- [pandas documentation — Working with missing data](https://pandas.pydata.org/docs/user_guide/missing_data.html)
