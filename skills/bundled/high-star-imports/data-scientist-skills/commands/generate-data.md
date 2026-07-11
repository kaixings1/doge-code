---
description: Generate realistic synthetic datasets for testing, prototyping, and demos
argument-hint: "<describe the dataset you need — columns, size, characteristics>"
---

# /generate-data — Synthetic Data Generator

Create realistic synthetic datasets matching your specifications.

## Invocation

```
/generate-data 10K rows of e-commerce transactions with seasonal trends
/generate-data A customer table with 5K records for testing a churn model
/generate-data Replicate the schema of this uploaded file with synthetic data
```

## Workflow

### Step 1: Define Requirements
- Schema (columns, types, constraints)
- Size (number of rows)
- Special characteristics (distributions, correlations, anomalies, time patterns)
- Output format (CSV, JSON, SQL, Python code)

### Step 2: Generate Data
Apply **generate-synthetic-data** skill:
- Create realistic data matching specifications
- Maintain referential integrity for relational tables
- Inject configured missing data patterns and outliers

### Step 3: Validate & Deliver
- Verify summary statistics match specifications
- Preview sample rows
- Deliver in requested format with generation script

Offer follow-up:
- "Want to **explore this data** with /eda?"
- "Need to **adjust distributions or add more columns**?"
- "Should I **generate related tables** with foreign key relationships?"
