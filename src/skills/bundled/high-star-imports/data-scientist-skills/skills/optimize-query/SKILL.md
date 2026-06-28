---
name: optimize-query
description: "Analyze and optimize slow SQL queries: EXPLAIN plan analysis, index recommendations, query rewriting, partitioning strategies, and materialized views. Use when queries are running slowly or consuming excessive resources."
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
