---
description: 聚类分析 — 包含验证与画像
argument-hint: "<describe your data and what groups you want to find>"
---

# /cluster — 聚类分析

通过验证发现数据中的自然分组。

## 调用

```
/cluster 按购买行为和人口统计对客户分群
/cluster [上传文件] 在此传感器数据中发现自然分组
/cluster 我们有多少种不同的用户类型？
```

## 工作流

应用 **clustering** 技能 → 确定最优 K 值 → 描绘聚类画像。

提供后续选项：
- "想要**构建分类器**来预测新数据的聚类归属吗？"
- "需要我使用 /visualize **可视化聚类结果**吗？"
