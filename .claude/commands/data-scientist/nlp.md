---
description: NLP管道 — 预处理、嵌入、建模、评估文本数据
argument-hint: "<describe your NLP task and text data>"
---

# /nlp — NLP Pipeline

Build an end-to-end NLP pipeline from text preprocessing to model evaluation.

## Invocation

```
/nlp Build a sentiment classifier for customer reviews
/nlp Extract product entities from these descriptions
/nlp Topic modeling on 10K support tickets
```

## Workflow

Apply **nlp-pipeline** skill:
1. Preprocess text data
2. Choose representation (TF-IDF, BERT, sentence-transformers)
3. Build and train model
4. Evaluate with appropriate metrics

Offer follow-up:
- "Want to **fine-tune a transformer** with /fine-tune?"
- "Should I **build a RAG system** with /build-rag?"
