---
name: ETL模式
description: "设计 ETL/ELT 流水线：增量加载、缓慢变化维度（SCD 类型 1-3）、去重、数据质量检查和幂等转换。适用于构建数据流水线或加载数据仓库。"
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
