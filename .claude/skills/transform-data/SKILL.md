---
name: 数据转换
description: "使用 pandas、polars 或 SQL 重塑、透视、融合、合并、聚合和转换表格数据。适用于重构数据集、组合多个表、创建聚合或在宽格式和长格式之间转换。"
---

# 数据转换

## 目的
Reshape and restructure datasets to match the format required for analysis, visualization, or modeling. Covers all common transformation patterns in pandas, polars, and SQL.

## 工作原理

### 步骤 1: Understand the Current and Target Structure
- Identify the current data shape (wide vs. long, normalized vs. denormalized)
- Clarify the desired output structure
- Map columns to their roles (identifiers, variables, values)

### 步骤 2: Apply Transformations

**Reshaping:**
- **Pivot**: Long → wide (aggregate values into columns)
- **Melt/Unpivot**: Wide → long (columns into rows)
- **Stack/Unstack**: Multi-level index manipulation
- **Transpose**: Swap rows and columns

**Combining:**
- **Merge/Join**: Combine tables on key columns (inner, left, right, outer, cross)
- **Concat**: Stack datasets vertically or horizontally
- **Append**: Add new rows to existing data

**Aggregating:**
- **GroupBy**: Split-apply-combine with custom aggregation functions
- **Rolling windows**: Moving averages, cumulative sums, expanding statistics
- **Pivot tables**: Multi-dimensional aggregation with subtotals

**Deriving:**
- **Apply/Map**: Custom transformations per row or column
- **Binning**: Cut continuous variables into categories
- **Ranking**: Rank values within groups
- **Lag/Lead**: Shift values for time-based comparisons

### 步骤 3: Generate Code
- pandas, polars, or SQL — based on user preference
- Include data validation before and after transformation
- Add comments explaining each step

## 使用示例

**Example 1: Pivot for dashboard**
```
"Convert this transaction-level data into a monthly revenue pivot table
with products as columns and months as rows"
```

**Example 2: Merge datasets**
```
"Join this user table with the events table on user_id,
keeping all users even if they have no events"
```

**Example 3: Complex aggregation**
```
"Calculate the 7-day rolling average of daily active users,
grouped by country and platform"
```

## 输出格式

- **Transformation Plan**: Step-by-step description of the restructuring
- **Code**: pandas / polars / SQL implementation with comments
- **Preview**: Before and after data samples showing the transformation
- **Validation**: Row count checks, null handling, key preservation verification
