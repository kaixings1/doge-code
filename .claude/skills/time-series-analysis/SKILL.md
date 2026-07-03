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
| * *基础（零拍） * * | TimesFM （谷歌）、Chronos （亚马逊）、Moment |新系列，冷启动，无需培训|
| * *粉底（微调） * * | Lag-Llama、Timer、MOIRAI |适应性强的粉底模型|
| * * Transformer * * | PatchTST、iTransformer、Crossformer |远程依赖项、多变量|
| * *时间融合* * | TFT、TSMixer、TSMixerX |多视野协变量|
| * *状态空间* * | S4 ， Mamba （用于序列） |超长序列（ > 10K ） |
| **