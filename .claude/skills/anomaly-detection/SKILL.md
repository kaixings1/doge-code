---
name: 异常检测
description: "使用统计和 ML 方法检测异常数据点和异常模式：Z-score、IQR、Isolation Forest、自编码器和上下文异常检测。适用于调查可疑数据、构建监控系统或识别异常行为。"
---

# Anomaly Detection

## Purpose
Identify data points or patterns that deviate significantly from expected behavior. Supports point anomalies, contextual anomalies, and collective anomalies.

## How It Works

### Step 1: Define Normal
- Establish baseline behavior from historical data
- Choose anomaly type: point (single value), contextual (unusual in context), collective (unusual group)
- Set sensitivity threshold (aggressive vs. conservative detection)

### Step 2: Apply Detection Methods
- **Statistical**: Z-score, IQR, Grubbs' test, Dixon's Q test
- **ML-based**: Isolation Forest, Local Outlier Factor, One-Class SVM
- **Time-series**: STL residuals, Prophet anomalies, ARIMA forecast errors
- **Deep learning**: Autoencoders (reconstruction error as anomaly score)

### Step 3: Score & Rank
- Anomaly score per data point (0-1 scale)
- Rank by severity and business impact
- Distinguish true anomalies from noise using ensemble methods

### Step 4: Root Cause Analysis
- Feature contribution to anomaly score
- Temporal context (when did it start/end?)
- Correlation with external events

## Usage Examples

```
"Detect anomalies in our server response times over the past month"
```

```
"Build an anomaly detection system for credit card transactions"
```

## Output Format

- **Anomaly List**: Flagged points with scores, timestamps, and context
- **Visualizations**: Time series with anomalies highlighted, score distributions
- **Root Cause Hints**: Features driving each anomaly
- **Python Code**: Detection pipeline (fit on training, apply to new data)
