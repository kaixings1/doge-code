---
name: 异常值检测
description: "统计和基于 ML 的异常值检测：IQR 方法、Z-score、修正 Z-score、Isolation Forest、DBSCAN 和局部异常因子。适用于调查异常、在建模前清理数据或构建异常检测系统。"
---

# 异常值检测

## 目的
使用统计和机器学习方法的组合识别异常数据点。确定异常值是应移除的错误、应调查的有趣信号，还是应保留的自然变异。

## 工作原理

### 步骤 1：单变量检测
- **IQR 方法**：标记 Q1 - 1.5×IQR 到 Q3 + 1.5×IQR 范围之外的点
- **Z 分数**：标记与均值相差 >3 个标准差的点
- **修正 Z 分数**：使用 MAD（中位数绝对偏差）以增强对偏斜数据的鲁棒性
- **基于百分位**：标记极端百分位数（第 1/99 或自定义阈值）

### 步骤 2：多变量检测
- **Isolation Forest**：基于树的异常检测——在更少的分裂中隔离异常值
- **Local Outlier Factor (LOF)**: Density-based — compares local density to neighbors
- **DBSCAN**: Cluster-based — points not assigned to any cluster are anomalies
- **Mahalanobis Distance**: Accounts for correlations between features

### 步骤 3: 上下文ual Analysis
- Are outliers clustered in time? → Possible data collection issues
- Are outliers associated with specific categories? → Segment-specific behavior
- Do outliers have domain meaning? → e.g., Black Friday sales spikes are real
- Are outliers influential on model results? → Cook's distance, leverage plots

### 步骤 4: Treatment Recommendation

| Scenario | Action |
|----------|--------|
| Data entry error | Remove or correct |
| Measurement error | Remove or flag |
| Natural extreme value | Keep — consider robust methods |
| Interesting signal | Investigate further — separate analysis |
| Model-influential | Winsorize or use robust estimators |

### 步骤 5: Generate Code
- Python code for detection (scipy, sklearn, pyod)
- Visualization: box plots, scatter plots with outliers highlighted
- Before/after comparison with impact on summary statistics

## 用法 Examples

**Example 1: Sales data**
```
"Flag outliers in our daily revenue data — I suspect some data entry
errors but also want to catch genuine anomalies like flash sales"
```

**Example 2: ML preprocessing**
```
"I'm building a regression model. Which outlier detection method should
I use, and should I remove or winsorize the outliers?"
```

**Example 3: Multivariate**
```
"Detect multivariate outliers in this customer behavior dataset —
individual features look normal but some combinations are suspicious"
```

## 输出格式

- **Outlier Report**: Count and percentage flagged per method
- **Visualization**: Annotated plots showing detected outliers
- **Classification**: Each outlier categorized (error / natural / signal)
- **Treatment Plan**: Recommended action per outlier group
- **Python Code**: Reproducible detection and treatment pipeline
