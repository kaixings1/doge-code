---
name: 分类分析
description: "构建分类模型：逻辑回归、决策树、随机森林、XGBoost、LightGBM、SVM 和 KNN。包含类别不平衡处理、阈值调优和多类策略。适用于从特征预测类别。"
---

# 分类分析

## 目的
构建、训练和评估分类模型，正确处理不平衡类、阈值优化和多类策略。

## 工作原理

### 步骤 1：问题设置
- 二分类 vs. 多分类 vs. 多标签
- 类别分布分析（不平衡检测）
- 训练/验证/测试拆分策略（分层）

### 步骤 2：处理类别不平衡
- **重采样**：SMOTE、ADASYN（过采样少数类）、随机欠采样
- **类别权重**：调整损失函数（class_weight='balanced'）
- **Threshold tuning**: Optimize decision threshold for business metric
- **Ensemble**: BalancedRandomForest, EasyEnsemble

### 步骤 3: Train Models
- Start with logistic regression (baseline)
- Try tree-based: Random Forest, XGBoost, LightGBM
- 考虑 SVM for high-dimensional data
- Use cross-validation for reliable estimates

### 步骤 4: Evaluate
- **Metrics**: Accuracy, precision, recall, F1, AUC-ROC, AUC-PR
- **Confusion matrix**: TP, FP, TN, FN breakdown
- **Classification report**: Per-class metrics
- **Calibration curve**: Probability reliability
- **Learning curves**: Bias-variance diagnosis

### 步骤 5: Optimize Threshold
- Plot precision-recall curve
- Find optimal threshold for business objective (minimize false negatives vs. false positives)
- Report metrics at chosen threshold

## 用法 Examples

```
"Build a churn prediction model — only 5% of users churn,
so the data is highly imbalanced"
```

```
"Classify customer support tickets into 8 categories"
```

## 输出格式

- **Model Comparison**: Metrics table across models
- **Best Model**: 配置, hyperparameters, performance
- **Confusion Matrix**: Visual with per-class analysis
- **Feature Importance**: Top predictive features
- **Python Code**: Complete sklearn / XGBoost pipeline
