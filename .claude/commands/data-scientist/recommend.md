---
description: 设计与构建推荐系统 — 召回、排序、重排
argument-hint: "<describe your recommendation scenario, data, and business goals>"
---

# /recommend — Recommendation System Builder

Design a multi-stage recommendation system with industrial-grade models.

## Invocation

```
/recommend Build a video recommendation system for 10M videos and 50M users
/recommend Add deep ranking to our e-commerce product recommendations
/recommend Design recall + ranking pipeline for our news feed
/recommend Our recommendations have a filter bubble problem — improve diversity
```

## Workflow

### Step 1: Define the Problem
- Scenario: e-commerce, content, ads, social, news
- Signals: clicks, purchases, watch time, likes, shares
- Scale: item catalog size, user base, QPS requirements

### Step 2: Recall Design
Apply **recommendation-systems** skill — DSSM, SASRec, MIND for candidate generation.
Design ANN index (FAISS/Milvus) and multi-channel recall strategy.

### Step 3: Ranking Design
Select ranking model based on scenario:
- **Baseline**: DeepFM or DCN V2
- **With behavior sequence**: DIN → DIEN → BST (progressive complexity)
- **Multi-task**: MMOE or PLE for CTR + CVR + engagement

### Step 4: Re-Ranking
Multi-objective optimization with diversity (DPP) and business rules.

### Step 5: Evaluation & Serving
- Offline: AUC, GAUC, NDCG, HitRate@K
- Online: A/B test on CTR, CVR, GMV, user engagement
- Serving architecture with latency budgets

Offer follow-up:
- "Want to **add real-time features** via a feature store?"
- "Should I **implement the recall model** in PyTorch?"
- "Need to **deploy** the ranking model with TensorRT?"
- "Want to **design A/B testing** for the new model with /analyze-test?"
