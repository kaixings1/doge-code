---
name: DBT模型
description: "设计 dbt（数据构建工具）模型：项目结构、staging/intermediate/marts 分层、源新鲜度测试、自定义 schema 测试和文档。适用于使用 dbt 构建分析工程流水线。"
---
# dbt Models

## Purpose
Design a well-structured dbt project following analytics engineering best practices.

## How It Works

### Project Structure
```
models/
├── staging/          # 1:1 with source tables, rename, cast, clean
│   └── stg_*.sql
├── intermediate/     # Business logic, joins, calculations
│   └── int_*.sql
└── marts/            # Final business entities for BI tools
    └── dim_*, fct_*
```

### Naming Conventions
- `stg_<source>__<entity>` — staging models
- `int_<entity>__<verb>` — intermediate transformations
- `dim_<entity>` — dimension tables
- `fct_<event>` — fact tables

### Testing
- `unique` and `not_null` on primary keys
- `accepted_values` for enums
- `relationships` for foreign keys
- Custom data tests for business rules

### Documentation
- `schema.yml` with column descriptions and tests
- `sources.yml` with source freshness checks
- Generate docs with `dbt docs generate`

## Usage Examples

```
"Set up a dbt project for our e-commerce analytics — staging from PostgreSQL, marts for BI"
```

## Output Format

- **Project Structure**: Directory layout
- **Model SQL**: Staging, intermediate, and marts models
- **Schema YML**: Tests and documentation
- **Configuration**: profiles.yml, dbt_project.yml
