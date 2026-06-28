---
description: 构建与评估分类模型
argument-hint: "<describe what you want to classify>"
---

# /classify — Classification

Build a classification model with proper handling of imbalanced classes.

## Invocation

```
/classify Predict customer churn — only 5% churn rate
/classify [upload file] Classify emails as spam or not spam
/classify Multi-class classification of product reviews into sentiment categories
```

## Workflow

Apply **classification** skill → **model-evaluation** skill → **model-interpretation** skill.

Offer follow-up:
- "Want to **tune** for better performance with /tune?"
- "Should I **explain predictions** with /explain-model?"
