---
description: 发现数据中的模式、分群与异常
argument-hint: "<describe what patterns you're looking for>"
---

# /find-patterns — 模式发现

发现数据中的自然分群、异常和隐藏模式。

## 调用

```
/find-patterns 此参与度数据中是否有自然的用户分群？
/find-patterns [上传文件] 发现异常和不寻常的模式
/find-patterns 我们的购买行为数据中存在哪些模式？
```

## 工作流

### 步骤 1：分群发现
应用 **segment-analysis** 技能——发现自然分组。

### 步骤 2：异常检测
应用 **anomaly-detection** 技能——标记异常点和模式。

### 步骤 3：关联分析
寻找共现模式和条件依赖关系。

### 步骤 4：报告
综合发现为可操作的洞察。

提供后续选项：
- "想要**进一步剖析特定分群**吗？"
- "需要我**构建模型**来预测分群归属吗？"
- "想要使用 /visualize **可视化**这些模式吗？"
