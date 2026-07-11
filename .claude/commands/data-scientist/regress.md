---
description: 构建与诊断回归模型 — 线性、逻辑或正则化
argument-hint: "<describe outcome variable and predictors>"
---

# /regress — 回归建模

构建、诊断和解释回归模型。

## 调用

```
/regress 根据面积、卧室数量、位置预测房价
/regress [上传文件] 运行逻辑回归以识别流失因素
/regress 构建 LASSO 模型以找到最重要的收入驱动因素
```

## 工作流

应用 **regression-analysis** 技能：
1. 根据结果变量选择模型类型
2. 使用适当的特征构建模型
3. 运行完整诊断（残差、VIF、影响）
4. 解释系数并生成预测

提供后续选项：
- "想要使用 /train-model **尝试 ML 模型**以获得更好的预测吗？"
- "需要我使用 /test-hypothesis **测试特定系数**吗？"
- "需要**添加交互项**或多项式特征吗？"
