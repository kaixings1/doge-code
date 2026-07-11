---
description: 超参数优化工作流 — 网格、随机或贝叶斯搜索
argument-hint: "<describe your model and optimization goal>"
---

# /tune — 超参数调优

优化模型超参数以获得更好的性能。

## 调用

```
/tune 优化我的 XGBoost 模型的 AUC-ROC
/tune 为此随机森林分类器找到最佳超参数
/tune 对我的 LightGBM 模型进行 100 次试验的贝叶斯优化
```

## 工作流

应用 **hyperparameter-tuning** 技能：
1. 定义搜索空间
2. 选择搜索策略
3. 使用交叉验证运行优化
4. 报告最佳参数和改进

提供后续选项：
- "想要使用 /explain-model **详细评估调优后的模型**吗？"
- "准备好使用 /deploy **部署**最终模型了吗？"
