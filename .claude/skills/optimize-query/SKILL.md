---
name: 查询优化
description: "分析和优化慢 SQL 查询：EXPLAIN 计划分析、索引建议、查询重写、分区策略和物化视图。当查询运行缓慢或消耗过多资源时使用。"
---
# Optimize Query

## Purpose
Diagnose and fix slow SQL queries through EXPLAIN analysis, indexing, and query rewriting.

## How It Works

### Step 1: Analyze EXPLAIN Plan
- Parse execution plan output
- Identify sequential scans, nested loops, sort operations
- Estimate cost breakdown by operation

### Step 2: Identify Bottlenecks
- Missing indexes on WHERE/JOIN/ORDER BY columns
- Full table scans on large tables
- Unnecessary subqueries or DISTINCT
- Implicit type conversions preventing index use
- N+1 query patterns

### Step 3: Optimize
- Add appropriate indexes (B-tree, hash, GIN, GiST)
- Rewrite subqueries as JOINs or CTEs
- Add partitioning for large tables
- Consider materialized views for complex aggregations
- Optimize JOIN order

### Step 4: Validate
- Compare EXPLAIN plans before and after
- Benchmark execution time improvement
- Check for regression on other queries

## Usage Examples

```
"This query takes 30 seconds on our 10M row table — optimize it"
```

## Output Format

- **Diagnosis**: Root cause of slowness
- **Optimized Query**: Rewritten SQL
- **Index Recommendations**: CREATE INDEX statements
- **Performance Comparison**: Before/after metrics
