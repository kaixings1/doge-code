---
name: postgres-patterns
description: PostgreSQL 数据库模式，用于查询优化、架构设计、索引和安全性。基于 Supabase 最佳实践。
origin: ECC
---

# PostgreSQL 最佳实践模式 (PostgreSQL Patterns)

PostgreSQL 最佳实践快速参考。如需详细指导，请使用 `database-reviewer` 智能体 (Agent)。

## 何时激活

- 编写 SQL 查询或迁移脚本
- 设计数据库架构 (架构)
- 排查慢查询问题
- 实现行级安全性 (Row Level 安全性, RLS)
- 设置连接池 (Connection Pooling)

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

### 索引速查表 (Index Cheat Sheet)

| 查询模式 | 索引类型 | 示例 |
|----------|----------|------|
| 等值查询 (`=`) | B-tree | `CREATE INDEX ON users (email);` |
| 范围查询 (`>`, `<`, `BETWEEN`) | B-tree | `CREATE INDEX ON orders (created_at);` |
| 排序 (`ORDER BY`) | B-tree | `CREATE INDEX ON users (created_at DESC);` |
| 文本搜索 (`ILIKE`, `to_tsvector`) | GIN / GiST | `CREATE INDEX ON articles USING GIN (to_tsvector('english', title));` |
| JSONB 包含 (`@>`) | GIN | `CREATE INDEX ON products USING GIN (metadata);` |
| 数组包含 | GIN | `CREATE INDEX ON posts USING GIN (tags);` |
| 部分查询 (`WHERE status = 'active'`) | 部分索引 | `CREATE INDEX ON users (email) WHERE status = 'active';` |
| 覆盖索引（避免回表） | 包含索引 | `CREATE INDEX ON users (id) INCLUDE (name, email);` |