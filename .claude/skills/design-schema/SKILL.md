---
name: 模式设计
description: "设计数据库 schema：规范化（1NF-BCNF）、反规范化策略、星型 schema、雪花 schema 和维度建模。适用于创建新数据库、重构现有数据库或构建数据仓库。"
---
# 模式设计

## 目的
设计针对您的用例优化的数据库 schema——OLTP、OLAP 或混合。

## 工作原理

### 步骤 1：需求
- OLTP（事务性） vs. OLAP（分析性）工作负载
- 关键实体和关系
- 查询模式和访问模式
- 规模预期

### 步骤 2：设计方法

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
