---
description: 构建RAG（检索增强生成）系统
argument-hint: "<describe your documents and use case>"
---

# /build-rag — RAG 系统构建器

构建用于文档问答的检索增强生成系统。

## 调用

```
/build-rag 内部文档的问答系统（500 份文档）
/build-rag 基于知识库的客户支持聊天机器人
/build-rag 回答学术论文问题的研究助手
```

## 工作流

应用 **llm-applications** + **embeddings-vectors** 技能：
1. 文档摄取和分块策略
2. 嵌入模型选择
3. 向量数据库设置
4. 检索管道（混合搜索、重排序）
5. 带引用追踪的生成
6. 评估（忠实度、相关性）

提供后续选项：
- "想要使用测试问题**评估 RAG 质量**吗？"
- "需要我**优化检索**以提高准确性吗？"
- "需要将其**部署**为 API 吗？"
