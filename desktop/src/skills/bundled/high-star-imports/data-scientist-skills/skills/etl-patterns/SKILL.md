---
name: etl-patterns
description: "Design ETL/ELT pipelines: incremental loads, slowly changing dimensions (SCD Types 1-3), deduplication, data quality checks, and idempotent transformations. Use when building data pipelines or loading data warehouses."
---
# ETL Patterns

## Purpose
Design reliable data pipelines using proven ETL/ELT patterns.

## Key Patterns

### Load Strategies
- **Full refresh**: Simple, correct, expensive
- **Incremental (append)**: New records only, using watermark
- **Incremental (upsert)**: Insert or update using MERGE
- **CDC**: Change Data Capture for real-time incremental

### Slowly Changing Dimensions
- **SCD Type 1**: Overwrite (no history)
- **SCD Type 2**: Add new row with effective dates (full history)
- **SCD Type 3**: Add columns for previous values (limited history)

### Data Quality
- Row count validation (source vs. target)
- Schema validation (column types, nullability)
- Business rule checks (referential integrity, ranges)
- Deduplication strategies (window functions, hash-based)

## Usage Examples

```
"Design an incremental ETL for loading daily sales data into our warehouse"
```

## Output Format

- **Pipeline Design**: Architecture and data flow
- **SQL/Python Code**: Implementation
- **Quality Checks**: Validation queries
- **Schedule**: Recommended run frequency
