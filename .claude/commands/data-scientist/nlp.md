---
description: NLP管道 — 预处理、嵌入、建模、评估文本数据
argument-hint: "<describe your NLP task and text data>"
---

# /nlp — NLP 管道

构建从文本预处理到模型评估的端到端 NLP 管道。

## 调用

```
/nlp 为客户评论构建情感分类器
/nlp 从这些描述中提取产品实体
/nlp 对 1 万条支持工单进行主题建模
```

## 工作流

应用 **nlp-pipeline** 技能：
1. 预处理文本数据
2. 选择表示方法（TF-IDF、BERT、sentence-transformers）
3. 构建和训练模型
4. 使用适当的指标评估

提供后续选项：
- "想要使用 /fine-tune **微调 transformer**吗？"
- "需要我使用 /build-rag **构建 RAG 系统**吗？"
