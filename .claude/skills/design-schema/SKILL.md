---
name: 模式设计
description: "设计数据库 架构：规范化（1NF-BCNF）、反规范化策略、星型 架构、雪花 架构 和维度建模。适用于创建新数据库、重构现有数据库或构建数据仓库。"
---
# 模式设计

## 目的
设计针对您的用例优化的数据库 架构——OLTP、OLAP 或混合。

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
| OLAP/DW | Star/snowflake 架构, denormalized |
| Hybrid | Normalized core + materialized aggregations |

### 步骤 3: Model
- Entity-relationship diagram
- Table definitions with data types and constraints
- Index strategy for common 查询 patterns
- 迁移 scripts (CREATE TABLE statements)

## 使用示例

```
"Design a 架构 for an e-commerce platform — users, products, orders, reviews"
```

## 输出格式

- **ERD**: Entity-relationship diagram
- **DDL**: CREATE TABLE statements
- **Index Strategy**: Recommended indexes
- **迁移 Scripts**: Ready-to-run SQL
