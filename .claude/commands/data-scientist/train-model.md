---
description: 端到端ML管道 — 选择模型、训练、评估、解释
argument-hint: "<describe prediction target and available data>"
---

# /train-model — ML 训练管道

从零开始构建一个可投入生产的机器学习模型。

## 调用

```
/train-model 从使用情况和人口统计数据预测客户流失
/train-model [上传文件] 构建预测房价的最佳模型
/train-model 将支持工单分类到不同类别
```

## 工作流

### 步骤 1：探索与准备
快速 EDA、处理缺失值、特征工程。

### 步骤 2：选择模型
应用 **choose-model** 技能——根据问题类型和数据推荐算法。

### 步骤 3：训练与调优
应用 **classification** 或 **regression-ml** 技能，然后进行**超参数调优**。

### 步骤 4：评估
应用 **model-evaluation** 技能——指标、诊断、交叉验证。

### 步骤 5：解释
应用 **model-interpretation** 技能——SHAP 值、特征重要性。

提供后续选项：
- "想要使用 /tune **进一步调优超参数**吗？"
- "需要我使用 /explain-model **解释特定预测**吗？"
- "准备好使用 /deploy **部署**此模型了吗？"
