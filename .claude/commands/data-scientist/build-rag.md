---
description: 构建RAG（检索增强生成）系统
argument-hint: "<describe your documents and use case>"
---

# /build-rag — RAG System Builder

Build a Retrieval-Augmented Generation system for document Q&A.

## Invocation

```
/build-rag Q&A system for our internal documentation (500 docs)
/build-rag Customer support chatbot using our knowledge base
/build-rag Research assistant that answers questions from academic papers
```

## Workflow

Apply **llm-applications** + **embeddings-vectors** skills:
1. Document ingestion and chunking strategy
2. Embedding model selection
3. Vector database setup
4. Retrieval pipeline (hybrid search, reranking)
5. Generation with citation tracking
6. Evaluation (faithfulness, relevance)

Offer follow-up:
- "Want to **evaluate RAG quality** with test questions?"
- "Should I **optimize retrieval** for better accuracy?"
- "Need to **deploy** this as an API?"
