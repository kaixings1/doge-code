---
name: 需求预测
description: "预测产品需求：整合季节性、促销、节假日、价格效应和外部因素。适用于库存规划、容量管理或收入预测。"
---
# Demand Forecasting

## Purpose
Predict future demand incorporating multiple factors for accurate planning.

## How It Works

### Step 1: Analyze Historical Demand
- Trend, seasonality, cyclicality
- Promotional effects and holiday impacts
- External factors (weather, economic indicators)

### Step 2: Choose Model
- **Simple**: Moving average, exponential smoothing
- **Statistical**: SARIMA, Prophet with regressors
- **ML**: XGBoost with lag features, LightGBM
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
