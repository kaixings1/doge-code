---
name: design-schema
description: "Design database schemas: normalization (1NF-BCNF), denormalization strategies, star schema, snowflake schema, and dimensional modeling. Use when creating a new database, redesigning an existing one, or building a data warehouse."
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
