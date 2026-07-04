---
name: 需求预测
description: "预测产品需求：整合季节性、促销、节假日、价格效应和外部因素。适用于库存规划、容量管理或收入预测。"
---
# 需求预测

## 目的
结合多种因素预测未来需求以实现准确规划。

## 工作原理

### 步骤 1：分析历史需求
- 趋势、季节性、周期性
- 促销效果和节假日影响
- 外部因素（天气、经济指标）

### 步骤 2：选择模型
- **简单**：移动平均、指数平滑
- **统计**：SARIMA、带回归量的 Prophet
- **机器学习**：带滞后特征的 XGBoost、LightGBM
- **Hierarchy**: Top-down, bottom-up, middle-out reconciliation

### Step 3: Include External Factors
- Promotions and pricing changes
- Calendar events and holidays
- Competitor actions
- Economic indicators

### Step 4: Evaluate
- Backtest with rolling origin cross-validation
- MAE, MAPE, WMAPE by product/region
- Bias detection (over/under-forecasting)

## Usage Examples

```
"Forecast weekly demand for our top 50 products including holiday effects"
```

## Output Format

- **Forecasts**: Point predictions with confidence intervals
- **Accuracy Metrics**: Historical backtest results
- **Factor Analysis**: Impact of each driver on demand
- **Python Code**: Prophet / XGBoost implementation
