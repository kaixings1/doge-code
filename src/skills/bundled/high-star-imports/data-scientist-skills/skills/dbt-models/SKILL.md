---
name: dbt-models
description: "Design dbt (data build tool) models: project structure, staging/intermediate/marts layers, source freshness tests, custom schema tests, and documentation. Use when building analytics engineering pipelines with dbt."
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
