---
description: 因果推断分析 — 从观测数据估计处理效应
argument-hint: "<describe the treatment, outcome, and available data>"
---

# /causal — 因果推断

在无法进行 A/B 测试时估计因果效应。

## 调用

```
/causal 我们的价格变化导致收入增加还是季节性因素？
/causal 估计忠诚度计划对留存率的因果影响
/causal [上传文件] 使用倾向评分匹配估计处理效应
```

## 工作流

应用 **causal-inference** 技能：
1. 构建因果问题并绘制有向无环图
2. 选择适当的方法（双重差分、倾向评分匹配、断点回归、工具变量）
3. 检查识别假设
4. 使用敏感性分析估计处理效应

提供后续选项：
- "想要**运行正式的 A/B 测试**吗？使用 /calculate-sample 进行规模估算。"
- "需要使用**不同方法估算**以增强稳健性吗？"
