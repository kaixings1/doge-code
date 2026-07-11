---
description: 时间序列预测工作流 — ARIMA、Prophet或指数平滑
argument-hint: "<describe your time series data and forecast horizon>"
---

# /forecast — 时间序列预测

构建和评估时间序列预测。

## 调用

```
/forecast 预测未来 6 个月的月度收入
/forecast [上传文件] 预测考虑节假日影响的每日用户注册量
/forecast 构建带有季节性调整的需求预测
```

## 工作流

应用 **time-series-analysis** 技能：
1. 评估平稳性并分解为成分
2. 选择并拟合最佳模型（ARIMA、Prophet、Holt-Winters）
3. 生成带有置信区间的预测
4. 在保持集上评估

提供后续选项：
- "想要使用 /analyze-trends **更详细地分析趋势**吗？"
- "需要**因果分析**来了解是什么驱动了趋势？"
- "需要我**并排比较多个模型**吗？"
