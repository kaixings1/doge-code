---
name: 合成数据生成
description: "创建用于测试、原型设计和演示的真实合成数据集。支持表格、时间序列和关系数据，具有可配置的分布、相关性和异常。适用于需要测试数据、想原型化分析或需要共享数据而无隐私问题。"
---

# 生成合成数据

## 目的
创建模拟真实世界数据特征的逼真合成数据集。适用于原型分析、测试管道、构建演示以及在无隐私风险的情况下共享数据。

## 工作原理

### 步骤 1: Define the 架构
- Column names, data types, and descriptions
- Relationships between columns (foreign keys, correlations)
- Business constraints (e.g., revenue > 0, age between 18-100)
- Target variable distribution (for ML datasets)

### 步骤 2: Configure Data 属性
- **Distributions**: Normal, log-normal, uniform, Poisson, custom
- **Correlations**: Specify relationships between features
- **Missing data**: Inject realistic missing patterns (MCAR, MAR, MNAR)
- **Outliers**: Add configurable percentage of anomalous records
- **Temporal patterns**: Trends, seasonality, cyclicality for time series
- **Categories**: Realistic category distributions (Zipf's law for names, cities)

### 步骤 3: Generate Data
- Use Faker for realistic names, emails, addresses, company names
- Use numpy/scipy distributions for numeric columns
- Maintain referential integrity across related tables
- Generate in requested format: CSV, JSON, SQL INSERT, Parquet, pandas DataFrame

### 步骤 4: Validate Synthetic Data
- Compare summary statistics to specified parameters
- Verify correlations match expectations
- Check constraint satisfaction
- Visual comparison: distribution plots, correlation heatmaps

## 用法 示例

**Example 1: E-commerce dataset**
```
"Generate 10,000 rows of e-commerce transaction data with user_id,
product_category, price, quantity, date, and a 5% return rate.
Include seasonal trends in Q4."
```

**Example 2: From 架构**
```
"Here's my database 架构 [upload]. Generate 5,000 realistic records
with proper foreign key relationships between tables."
```

**Example 3: ML training data**
```
"Create a binary classification dataset with 20 features,
30% class imbalance, and some noisy features for benchmarking models."
```

## 输出格式

- **Dataset**: Generated data in requested format (CSV, JSON, SQL, DataFrame code)
- **架构 Documentation**: Column descriptions and data generation rules
- **Statistics 总结**: Descriptive stats confirming the data meets specifications
- **Python Code**: Reproducible generation script for regenerating with different seeds/sizes
