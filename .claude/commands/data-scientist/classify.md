---
description: 构建与评估分类模型
argument-hint: "<describe what you want to classify>"
---

# /classify — 分类

构建分类模型并妥善处理不平衡类别。

## 调用

```
/classify 预测客户流失——仅 5% 的流失率
/classify [上传文件] 将电子邮件分类为垃圾邮件或非垃圾邮件
/classify 将产品评论多分类为情感类别
```

## 工作流

应用 **classification** 技能 → **model-evaluation** 技能 → **model-interpretation** 技能。

提供后续选项：
- "想要使用 /tune **调整**以获得更好的性能吗？"
- "需要我使用 /explain-model **解释预测结果**吗？"
