---
name: SQL编写
description: "从自然语言描述生成 SQL 查询。支持 BigQuery、PostgreSQL、MySQL、Snowflake 和其他方言。从上传的图表或文档读取数据库 schema。适用于编写 SQL、构建数据报告或将业务问题转化为查询。"
---
# SQL Query Generator

## Purpose
Transform natural language requirements into optimized SQL queries across multiple database platforms.

## How It Works

### Step 1: Understand Your Database Schema
- If you provide a schema file, read and analyze it
- Extract table names, column definitions, relationships
- Identify primary keys, foreign keys, and indexes

### Step 2: Process Your Request
- Clarify the exact data you need
- Confirm SQL dialect (BigQuery, PostgreSQL, MySQL, Snowflake)
- Ask for any additional requirements (filters, aggregations, sorting)

### Step 3: Generate Optimized Query
- Write efficient SQL leveraging your database structure
- Include comments explaining complex logic
- Use CTEs for readability in complex queries
- Handle edge cases (NULLs, timezones, duplicates)

### Step 4: Explain and Iterate
- Explain query logic in plain English
- Suggest performance optimizations
- Offer alternative approaches

## Usage Examples

```
"Generate a query to find users who signed up in the last 30 days and had at least 5 active sessions"
```

```
"Create a BigQuery query for revenue by region with year-over-year growth rates"
```

## Output Format

- **SQL Query**: Production-ready code with comments
- **Explanation**: What the query does and how
- **Performance Notes**: Optimization tips
- **Assumptions**: Schema assumptions made
