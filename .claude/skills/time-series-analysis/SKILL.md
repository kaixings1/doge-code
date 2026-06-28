---
name: 时间序列分析
description: "SOTA 时间序列建模：基础模型（TimesFM、Chronos、Lag-Llama）、PatchTST、Temporal Fusion Transformer，以及经典 ARIMA/Prophet/指数平滑。包含零样本预测、分层调和、共形预测区间和现代评估。适用于时序数据的预测、异常检测或分类。"
---

# Time Series Analysis

## Purpose
Model and forecast temporal data using the latest foundation models alongside proven classical methods.

## How It Works

### Step 1: Assess Data
- Stationarity: ADF, KPSS tests
- Frequency detection, missing timestamps, gaps
- Length: <100 → classical; >100 → ML/DL; any → foundation models (zero-shot)
- Decomposition: STL for trend/seasonal/residual

### Step 2: Model Selection (2025 SOTA)

| Category | Model | Best For |
|----------|-------|----------|
| **Foundation (zero-shot)** | TimesFM (Google), Chronos (Amazon), Moment | New series, cold start, no training needed |
| **Foundation (fine-tunable)** | Lag-Llama, Timer, MOIRAI | Adaptable foundation models |
| **Transformer** | PatchTST, iTransformer, Crossformer | Long-range dependencies, multivariate |
| **Temporal Fusion** | TFT, TSMixer, TSMixerX | Multi-horizon with covariates |
| **State Space** | S4, Mamba (for sequences) | Very long sequences (>10K) |
| **Classical SOTA** | Auto-ARIMA, ETS, Theta | Univariate, short series, interpretable |
| **Prophet+** | NeuralProphet, Prophet | Seasonality + holidays + regressors |
| **ML** | LightGBM with lag features | Tabular feature engineering approach |
| **Ensemble** | Nixtla StatsForecast + MLForecast | Best of classical + ML |

**Paradigm shift**: Foundation models for time series enable zero-shot forecasting — like how GPT changed NLP. TimesFM can forecast any series without training on it.

### Step 3: Feature Engineering (for ML/DL)
```python
# Proven lag features for time series ML
features = {
    "lags": [1, 7, 14, 28, 365],        # Historical values
    "rolling": ["mean_7d", "std_7d", "mean_28d"],  # Rolling statistics
    "calendar": ["dow", "month", "is_holiday", "week_of_year"],
    "fourier": "add_fourier_terms(period=365, n=5)",  # Seasonality
    "external": ["promotions", "weather", "competitors"],
}
```

### Step 4: Evaluation (Proper Time Series CV)
- **Expanding window**: Train on [0:t], test on [t:t+h], slide forward
- **Metrics**: MAE, RMSE, MAPE, SMAPE, MASE (scale-invariant)
- **Residual diagnostics**: Ljung-Box test for autocorrelation
- **Calibration**: Check coverage of prediction intervals

### Step 5: Prediction Intervals
- **Conformal prediction**: Distribution-free, guaranteed coverage
- **Quantile regression**: Predict percentiles directly
- **Bootstrapping**: Residual-based intervals
- **Bayesian**: Full posterior predictive distribution

### Hierarchical Forecasting
- **Bottom-up**: Forecast each leaf, sum up
- **Top-down**: Forecast aggregate, distribute proportionally
- **Middle-out**: Forecast mid-level, reconcile both ways
- **Optimal reconciliation**: MinT (minimum trace) — SOTA

## Usage Examples

```
"Forecast daily revenue for 500 stores, 3 months ahead.
Some stores opened recently with <30 days of data."
→ TimesFM zero-shot for new stores, LightGBM for established stores,
  hierarchical reconciliation for consistency
```

## Output Format

- **Forecasts**: Point + 80/95% intervals, model comparison
- **Evaluation**: Backtest metrics per model with statistical comparison
- **Diagnostics**: Residual analysis, calibration check
- **Python Code**: Nixtla / GluonTS / statsforecast implementation
- **Foundation Model Code**: TimesFM / Chronos inference scripts

---

### Key References
- Das et al. (2024) — *TimesFM: A Decoder-Only Foundation Model for Time-Series Forecasting*
- Ansari et al. (2024) — *Chronos: Learning the Language of Time Series*
- Nie et al. (2023) — *PatchTST: A Time Series is Worth 64 Words*
- Rasul et al. (2024) — *Lag-Llama: Towards Foundation Models for Probabilistic Time Series Forecasting*
