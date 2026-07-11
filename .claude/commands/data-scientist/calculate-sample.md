---
description: 功效分析与实验样本量计算
argument-hint: "<baseline rate, minimum detectable effect, desired power>"
---

# /calculate-sample — 样本量计算器

计算实验所需的样本量。

## 调用

```
/calculate-sample 基准转化率 3%，最小可检测效应 0.5%，功效 80%
/calculate-sample 检测留存率提升 5% 的 A/B 测试需要多少用户？
/calculate-sample 我们每天有 1 万访客——需要运行多久？
```

## 工作流

应用 **sample-size-calculator** 技能：
1. 明确参数（基准、MDE、α、功效）
2. 计算每组所需样本量
3. 基于流量估算测试持续时间
4. 生成敏感性表（MDE × 功效矩阵）

提供后续选项：
- "准备好使用 /analyze-test **分析测试结果**了吗？"
- "想要**设计测试**并使用适当的随机化方法吗？"
