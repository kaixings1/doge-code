---
name: database
description: "数据库开发和运维工作流，涵盖 SQL、NoSQL、数据库设计、迁移、优化和数据工程。"
category: 工作流-bundle
risk: safe
source: personal
date_added: "2026-02-27"
---

# 数据库工作流包

## 概述

全面的数据库工作流，涵盖数据库设计、开发、优化、迁移和数据工程。包括 SQL、NoSQL 和现代数据平台。

## 何时使用此工作流

在以下情况下使用此工作流：
- 设计数据库模式时
- 实施数据库迁移时
- 优化查询性能时
- 设置数据管道时
- 管理数据库操作时
- 实施数据质量时

## 工作流 Phases

### Phase 1: Database Design

#### Skills to Invoke
- `database-architect` - Database architecture
- `database-design` - 架构 design
- `postgresql` - PostgreSQL design
- `nosql-expert` - NoSQL design

#### Actions
1. Gather requirements
2. Design 架构
3. Define relationships
4. Plan indexing strategy
5. Design for scalability

#### Copy-Paste Prompts
```
Use @database-architect to design database 架构
```

```
Use @postgresql to design PostgreSQL 架构
```

### Phase 2: Database Implementation

#### Skills to Invoke
- `prisma-expert` - Prisma ORM
- `database-migrations-sql-migrations` - SQL migrations
- `neon-postgres` - Serverless Postgres

#### Actions
1. Set up database connection
2. Configure ORM
3. Create migrations
4. Implement models
5. Set up seed data

#### Copy-Paste Prompts
```
Use @prisma-expert to set up Prisma ORM
```

```
Use @database-migrations-sql-migrations to create migrations
```

### Phase 3: 查询 Optimization

#### Skills to Invoke
- `database-optimizer` - Database optimization
- `sql-optimization-patterns` - SQL optimization
- `postgres-best-practices` - PostgreSQL optimization

#### Actions
1. Analyze slow queries
2. Review execution plans
3. Optimize indexes
4. Refactor queries
5. Implement caching

#### Copy-Paste Prompts
```
Use @database-optimizer to optimize database performance
```

```
Use @sql-optimization-patterns to optimize SQL queries
```

### Phase 4: Data 迁移

#### Skills to Invoke
- `database-迁移` - Database 迁移
- `framework-迁移-code-migrate` - Code 迁移

#### Actions
1. Plan 迁移 strategy
2. Create 迁移 scripts
3. Test 迁移
4. Execute 迁移
5. Verify data integrity

#### Copy-Paste Prompts
```
Use @database-迁移 to plan database 迁移
```

### Phase 5: Data Pipeline Development

#### Skills to Invoke
- `data-engineer` - Data engineering
- `data-engineering-data-pipeline` - Data pipelines
- `airflow-dag-patterns` - Airflow workflows
- `dbt-transformation-patterns` - dbt transformations

#### Actions
1. Design data pipeline
2. Set up data ingestion
3. Implement transformations
4. Configure scheduling
5. Set up monitoring

#### Copy-Paste Prompts
```
Use @data-engineer to design data pipeline
```

```
Use @airflow-dag-patterns to create Airflow DAGs
```

### Phase 6: Data Quality

#### Skills to Invoke
- `data-quality-frameworks` - Data quality
- `data-engineering-data-driven-feature` - Data-driven features

#### Actions
1. Define quality metrics
2. Implement validation
3. Set up monitoring
4. Create alerts
5. Document standards

#### Copy-Paste Prompts
```
Use @data-quality-frameworks to implement data quality checks
```

### Phase 7: Database Operations

#### Skills to Invoke
- `database-admin` - Database administration
- `backup-automation` - Backup automation

#### Actions
1. Set up backups
2. Configure replication
3. Monitor performance
4. Plan capacity
5. Implement security

#### Copy-Paste Prompts
```
Use @database-admin to manage database operations
```

## 数据库技术工作流

### PostgreSQL
```
技能: postgresql, postgres-best-practices, neon-postgres, prisma-expert
```

### MongoDB
```
技能: nosql-expert, azure-cosmos-db-py
```

### Redis
```
技能: bullmq-specialist, upstash-qstash
```

### 数据仓库
```
技能: clickhouse-io, dbt-transformation-patterns
```

## 质量门

- [ ] 模式设计并审查完成
- [ ] 迁移测试完成
- [ ] 性能基准达成
- [ ] 备份配置完成
- [ ] 监控就位
- [ ] 文档完成

## 相关工作流包

- `development` - 应用开发
- `cloud-devops` - 基础设施
- `ai-ml` - AI/ML 数据管道
- `testing-qa` - 数据测试

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
