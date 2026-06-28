---
name: 窗口函数
description: "掌握 SQL 窗口函数：ROW_NUMBER、RANK、DENSE_RANK、LAG、LEAD、运行总计、移动平均、百分位数、NTILE 和 FIRST_VALUE/LAST_VALUE。适用于需要排名结果、运行计算或分区内比较时。"
---
# Window Functions

## Purpose
Write SQL window functions for ranking, running calculations, and partition-based analysis.

## Quick Reference

| Function | Use Case |
|----------|----------|
| ROW_NUMBER() | Unique sequential numbering |
| RANK() | Ranking with gaps for ties |
| DENSE_RANK() | Ranking without gaps |
| LAG(col, n) | Previous row value |
| LEAD(col, n) | Next row value |
| SUM() OVER | Running/cumulative total |
| AVG() OVER (ROWS n) | Moving average |
| NTILE(n) | Divide into n equal buckets |
| PERCENT_RANK() | Percentile rank (0-1) |
| FIRST_VALUE / LAST_VALUE | First/last in window |

### Frame Specification
```sql
-- Running total
SUM(amount) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING)
-- 7-day moving average
AVG(value) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
-- Partition by group
RANK() OVER (PARTITION BY department ORDER BY salary DESC)
```

## Usage Examples

```
"Calculate each user's rank by total purchases within their country"
```

```
"7-day moving average of daily revenue with a running total column"
```

## Output Format

- **SQL Query**: Window function implementation with comments
- **Explanation**: How the window frame works
- **Alternatives**: Different approaches for the same result
