---
name: postgres-optimization
description: PostgreSQL优化 — 包括索引、查询计划、分区、连接池和性能调优。
---

# PostgreSQL 优化

## 索引策略

```sql
-- B-tree index for equality and range queries (default)
CREATE INDEX idx_orders_customer_id ON orders (customer_id);

-- Composite index (column order matters: equality columns first, range last)
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);

-- Partial index (smaller, faster for filtered queries)
CREATE INDEX idx_orders_pending ON orders (created_at)
  WHERE status = 'pending';

-- Covering index (avoids table lookup entirely)
CREATE INDEX idx_users_email_name ON users (email) INCLUDE (name, avatar_url);

-- GIN index for JSONB containment queries
CREATE INDEX idx_products_metadata ON products USING GIN (metadata);

-- GiST index for full-text search
CREATE INDEX idx_articles_search ON articles USING GiST (
  to_tsvector('english', title || ' ' || body)
);

-- Concurrent index creation (no table lock)
CREATE INDEX CONCURRENTLY idx_large_table_col ON large_table (col);
```

## 阅读查询计划

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, o.total, u.name
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.status = 'shipped'
  AND o.created_at > NOW() - INTERVAL '30 days'
ORDER BY o.created_at DESC
LIMIT 20;
```

在计划中需要关注的关键点：
- 大表上的 `Seq Scan` 表示缺少索引
- 高行估计的 `Nested Loop` 表示缺少连接索引
- 没有 `Index Scan` 的 `Sort` 意味着排序在内存/磁盘中进行
- `Buffers: shared hit` vs `shared read` 显示缓存效率

## 分区

```sql
CREATE TABLE events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type  TEXT NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_q1 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE events_2024_q2 PARTITION OF events
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- Index on each partition (inherited automatically in PG 11+)
CREATE INDEX ON events (created_at, event_type);
```

当查询持续按分区键过滤时，对超过 1000 万行的表进行分区。

## JSONB 操作

```sql
-- Query nested JSONB fields
SELECT * FROM products
WHERE metadata @> '{"category": "electronics"}'
  AND (metadata ->> 'price')::numeric < 500;

-- Update nested JSONB
UPDATE products
SET metadata = jsonb_set(metadata, '{stock}', to_jsonb(stock - 1))
WHERE id = 'abc';

-- Aggregate JSONB arrays
SELECT id, jsonb_array_elements_text(metadata -> 'tags') AS tag
FROM products
WHERE metadata ? 'tags';
```

## 连接池

```ini
# pgbouncer.ini
[databases]
app = host=localhost port=5432 dbname=app

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
server_idle_timeout = 300
```

Web 应用使用事务级连接池。使用预处理语句或临时表的应用使用会话级连接池。

## 常见调优参数

```sql
-- Check for slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Find unused indexes
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

## 反模式

- 在每个列上创建索引而非分析实际查询模式
- 只需要几列时使用 `SELECT *`
- 不使用 `EXPLAIN ANALYZE` 验证索引使用情况
- 当使用独立表配合适当类型更好时将大 blob 存储在 JSONB 中
- 缺少连接池（每个连接使用约 10MB 服务器内存）
- 在高峰时段运行 `VACUUM FULL`（锁定整个表）

## 检查清单

- [ ] 索引匹配实际查询模式（检查 `pg_stat_statements`）
- [ ] 复合索引排序：等值列、排序列、范围列
- [ ] 对所有关键查询运行了 `EXPLAIN ANALYZE`
- [ ] 对频繁过滤的子集使用了部分索引
- [ ] PostgreSQL 前配置了连接池（PgBouncer/pgcat）
- [ ] 对超过 1000 万行的表考虑了分区
- [ ] 识别并删除未使用的索引
- [ ] 启用 `pg_stat_statements` 用于查询性能监控
