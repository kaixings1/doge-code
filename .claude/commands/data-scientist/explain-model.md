---
description: 模型可解释性与特征重要性 — SHAP、LIME、PDP
argument-hint: "<describe the model you want to explain>"
---

# /explain-model — 模型解释

全局和针对单个预测解释模型行为。

## 调用

```
/explain-model 为什么此客户被标记为高流失风险？
/explain-model 为我们的贷款审批模型生成 SHAP 图
/explain-model 哪些特征驱动我们的收入预测模型？
```

## 工作流

应用 **model-interpretation** 技能：
1. 计算 SHAP 值
2. 生成全局重要性图
3. 为特定预测创建局部解释
4. 为利益相关者编写通俗语言叙述

提供后续选项：
- "想要使用 /tell-story **展示这些发现**吗？"
- "需要基于这些洞察**改进模型**吗？"
