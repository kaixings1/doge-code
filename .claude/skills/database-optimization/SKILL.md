---
name: 数据库优化
description: 数据库优化 — 查询优化、索引策略和数据库性能调优。
---

# 数据库优化

## EXPLAIN 分析

在优化之前始终运行 `EXPLAIN ANALYZE`。从下往上阅读输出。

```sql
-- PostgreSQL
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;

-- MySQL
EXPLAIN ANALYZE SELECT ...;
```

需要关注的关键指标：
- 大表上的 **Seq Scan** = 缺少索引
- 高行数的 **Nested Loop** = 考虑哈希/合并连接
- 没有索引的 **Sort** = 在排序列上添加索引
- **估计行数与实际行数** 差异 = 统计信息过时，运行 `ANALYZE`

## 索引策略

### B-tree（默认，大多数情况）
```sql
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_orders_user_date ON orders (user_id, created_at DESC);
```
用于：相等查询、范围查询、排序。复合索引中列的顺序很重要：先放相等列，再放范围/排序列。

### 部分索引（PostgreSQL）
```sql
CREATE INDEX idx_orders_pending ON orders (created_at)
  WHERE status = 'pending';
```
当查询始终针对特定条件进行过滤时使用。比完整索引小得多。

### GIN（PostgreSQL - 数组、JSONB、全文搜索）
```sql
CREATE INDEX idx_products_tags ON products USING GIN (tags);
CREATE INDEX idx_docs_search ON documents USING GIN (to_tsvector('english', content));
```

### GiST（PostgreSQL - 空间、范围类型）
```sql
CREATE INDEX idx_locations_point ON locations USING GiST (coordinates);
CREATE INDEX idx_events_period ON events USING GiST (tsrange(start_at, end_at));
```

### 覆盖索引（仅索引扫描）
```sql
-- PostgreSQL
CREATE INDEX idx_users_email_name ON users (email) INCLUDE (name);

-- MySQL
CREATE INDEX idx_users_email_name ON users (email, name);
```

## N+1 查询检测

症状：1 个查询获取父项 + N 个子项的每个查询。

```python
# 糟糕：N+1
users = db.查询(User).all()
for user in users:
    print(user.orders)  # 每个用户触发一次查询

# 良好：预加载
users = db.查询(User).options(joinedload(User.orders)).all()
```

```javascript
// 糟糕：N+1
const users = await User.findAll();
for (const user of users) {
  const orders = await Order.findAll({ where: { userId: user.id } });
}

// 良好：批量加载
const users = await User.findAll({ include: [Order] });
```

检测：启用查询日志记录，计数每个请求的查询数。单个端点超过 10 个查询是危险信号。

## 连接池

```
经验法则：pool_size = (core_count * 2) + disk_count
典型 Web 应用：每个应用实例 10-20 个连接
```

PostgreSQL：
- 在无服务器/高连接场景下使用事务模式的 PgBouncer
- 设置 `idle_in_transaction_session_timeout = '30s'`
- 使用 `pg_stat_activity` 监控

MySQL：
- 根据可用 RAM 设置 `max_connections`（每个连接约使用 10MB）
- 使用 ProxySQL 进行连接复用
- 使用 `SHOW PROCESSLIST` 监控

## 读取副本

- 将所有 `SELECT` 查询路由到副本
- 将所有写入路由到主库
- 考虑复制延迟（通常 10-100 毫秒）
- 绝不要从副本进行写后读取；使用主库进行一致性关键读取
- 使用连接级路由，而非查询级路由

```python
# SQLAlchemy 读取副本路由
class RoutingSession(会话):
    def get_bind(self, mapper=None, clause=None):
        if self._flushing or self.is_modified():
            return engines["primary"]
        return engines["replica"]
```

## 分区策略

### 范围分区（时间序列数据）
```sql
-- PostgreSQL
CREATE TABLE events (
    id bigint GENERATED ALWAYS AS IDENTITY,
    created_at timestamptz NOT NULL,
    data jsonb
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2025_q1 PARTITION OF events
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE events_2025_q2 PARTITION OF events
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
```

### 哈希分区（均匀分布）
```sql
CREATE TABLE sessions (
    id uuid PRIMARY KEY,
    user_id bigint NOT NULL
) PARTITION BY HASH (user_id);

CREATE TABLE sessions_0 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_1 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 1);
```

当表超过 50-100GB 或需要快速删除旧数据时进行分区。

## 查询优化检查清单

1. 运行 `EXPLAIN ANALYZE` 并阅读计划
2. 检查行数超过 10K 的表上的顺序扫描
3. 验证索引使用情况（检查 `pg_stat_user_indexes` 中的 `idx_scan`）
4. 查找阻止索引使用的隐式类型转换
5. 将 `SELECT *` 替换为特定列
6. 为只需要子集的查询添加 `LIMIT`
7. 使用 `EXISTS` 代替 `COUNT(*) > 0`
8. 批量处理 `INSERT`/`UPDATE` 操作（每批 500-1000 行）
9. 避免在 `WHERE` 子句中对索引列使用函数
10. 监控慢查询日志（pg：`log_min_duration_statement = 100`）

## 危险模式

- 在未索引的列上使用 `LIKE '%term%'`（改用全文搜索）
- 使用 `ORDER BY RANDOM()`（改用 `TABLESAMPLE` 或应用级随机化）
- `SELECT DISTINCT` 掩盖连接问题
- `UPDATE`/`DELETE` 缺少 `WHERE`（始终先用 `SELECT` 验证）
- 持有锁的长期运行事务
- 使用 `OFFSET` 进行深度分页（改用键集/游标分页）
