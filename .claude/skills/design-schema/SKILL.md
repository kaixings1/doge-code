---
name: 模式设计
description: "设计数据库 schema：规范化（1NF-BCNF）、反规范化策略、星型 schema、雪花 schema 和维度建模。适用于创建新数据库、重构现有数据库或构建数据仓库。"
---
# Design Schema

## Purpose
Design database schemas optimized for your use case — OLTP, OLAP, or hybrid.

## How It Works

### Step 1: Requirements
- OLTP (transactional) vs. OLAP (analytical) workload
- Key entities and relationships
- Query patterns and access patterns
- Scale expectations

### Step 2: Design Approach

| Workload | Strategy |
|----------|----------|
| OLTP | Normalized (3NF), strong constraints |
| OLAP/DW | Star/snowflake schema, denormalized |
| Hybrid | Normalized core + materialized aggregations |

### Step 3: Model
- Entity-relationship diagram
- Table definitions with data types and constraints
- Index strategy for common query patterns
- Migration scripts (CREATE TABLE statements)

## Usage Examples

```
"Design a schema for an e-commerce platform — users, products, orders, reviews"
```

## Output Format

- **ERD**: Entity-relationship diagram
- **DDL**: CREATE TABLE statements
- **Index Strategy**: Recommended indexes
- **Migration Scripts**: Ready-to-run SQL
