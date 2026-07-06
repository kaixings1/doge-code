---
name: 推荐系统
description: "工业推荐系统：召回（DSSM、SASRec、MIND、Swing、ItemCF）、预排序（COLD）、排序（DIN、DIEN、BST、DCN V2、DeepFM）、重排序（PLE、MMOE、DPP）、CTR 特征工程和实时服务架构。涵盖顶级科技公司使用的完整召回→预排序→排序→重排序流水线。适用于构建推荐、搜索排序或广告系统。"
---

# Recommendation Systems

## 目的
Design and build industrial-grade recommendation systems using the multi-stage architecture adopted by Alibaba, ByteDance, Google, Meta, and other top tech companies.

## 工作原理

### System 架构 (Industrial Standard)

```
┌──────────────────────────────────────────────────────┐
│                    User 请求                       │
├──────────────────────────────────────────────────────┤
│  Stage 1: RECALL (Candidate Generation)               │
│  Input: billions of items → Output: ~1000 candidates  │
│  Models: DSSM, SASRec, MIND, Swing, ItemCF, ANN      │
│  Latency budget: <50ms                                │
├──────────────────────────────────────────────────────┤
│  Stage 2: PRE-RANKING (Coarse Ranking)                │
│  Input: ~1000 items → Output: ~200 items              │
│  Models: COLD, simple DNN, distilled models           │
│  Latency budget: <20ms                                │
├──────────────────────────────────────────────────────┤
│  Stage 3: RANKING (Fine Ranking)                      │
│  Input: ~200 items → Output: scored items              │
│  Models: DIN, DIEN, BST, DCN V2, DeepFM, DLRM        │
│  Latency budget: <100ms                               │
├──────────────────────────────────────────────────────┤
│  Stage 4: RE-RANKING (Strategy Layer)                 │
│  Input: top items → Output: final list                 │
│  Models: PLE, MMOE, DPP (diversity), business rules   │
│  Multi-objective: CTR × CVR × diversity × freshness   │
│  Latency budget: <30ms                                │
└──────────────────────────────────────────────────────┘
```
