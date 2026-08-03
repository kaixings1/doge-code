---
name: recommendation-systems
description: "Industrial recommendation systems: recall (DSSM, SASRec, MIND, Swing, ItemCF), pre-ranking (COLD), ranking (DIN, DIEN, BST, DCN V2, DeepFM), re-ranking (PLE, MMOE, DPP), multi-task learning, feature engineering for CTR, and real-time serving architecture. Covers the full recall→pre-rank→rank→re-rank pipeline used at top tech companies. Use when building recommendation, search ranking, or ad systems."
---

# Recommendation Systems

## Purpose
Design and build industrial-grade recommendation systems using the multi-stage architecture adopted by Alibaba, ByteDance, Google, Meta, and other top tech companies.

## How It Works

### System Architecture (Industrial Standard)

```
┌──────────────────────────────────────────────────────┐
│                    User Request                       │
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

---

## Stage 1: Recall (Candidate Generation)

Retrieve a small subset of relevant items from billions. Multiple recall channels are used in parallel.

### Collaborative Filtering Recall

| Model | Type | Key Idea |
|-------|------|----------|
| **ItemCF** | Item-based CF | Co-occurrence in user histories |
| **UserCF** | User-based CF | Similar users like similar items |
| **Swing** | Graph-based CF | Penalize popular co-occurrence, reward niche overlap |
| **ALS / BPR** | Matrix factorization | Latent factors for users and items |

### Deep Recall Models

| Model | Architecture | Key Innovation | Paper |
|-------|-------------|----------------|-------|
| **DSSM** | Dual-tower (user tower + item tower) | Separate encoders → ANN retrieval | Microsoft, 2013 |
| **YoutubeDNN** | User history → DNN → softmax over items | Candidate generation at YouTube scale | Google, 2016 |
| **MIND** | Multi-Interest Network with Dynamic routing | Capsule network for multiple user interests | Alibaba, 2019 |
| **SDM** | Sequential Deep Matching | Long-term + short-term user intent | Alibaba, 2019 |
| **SASRec** | Self-Attention Sequential Rec | Transformer for user action sequences | UCSD, 2018 |
| **BERT4Rec** | Bidirectional self-attention | Masked item prediction (BERT-style) | Alibaba, 2019 |
| **GNN-based** | PinSage, LightGCN | Graph convolution over user-item bipartite graph | Pinterest, 2018 |
| **TDM** | Tree-based Deep Model | Hierarchical tree for large-scale retrieval | Alibaba, 2018 |

### DSSM (Deep Structured Semantic Model) — Detail

```python
# DSSM Architecture
class DSSM(nn.Module):
    """Dual-tower model for recall. User and item towers
    are trained jointly but serve independently."""

    def __init__(self, user_feat_dim, item_feat_dim, emb_dim=128):
        # User Tower: user_features → MLP → user_embedding (128d)
        self.user_tower = nn.Sequential(
            nn.Linear(user_feat_dim, 256),
            nn.ReLU(), nn.BatchNorm1d(256),
            nn.Linear(256, emb_dim)
        )
        # Item Tower: item_features → MLP → item_embedding (128d)
        self.item_tower = nn.Sequential(
            nn.Linear(item_feat_dim, 256),
            nn.ReLU(), nn.BatchNorm1d(256),
            nn.Linear(256, emb_dim)
        )

    def forward(self, user_feat, item_feat):
        user_emb = F.normalize(self.user_tower(user_feat), dim=1)
        item_emb = F.normalize(self.item_tower(item_feat), dim=1)
        return torch.sum(user_emb * item_emb, dim=1)  # cosine sim

# Serving: pre-compute item embeddings → FAISS/Milvus ANN index
# Online: compute user embedding → ANN top-K retrieval (<10ms)
```

### SASRec (Self-Attentive Sequential Recommendation) — Detail

```python
# SASRec: Transformer encoder on user action sequence
# Input: [item_1, item_2, ..., item_n] (user's click history)
# Output: next item prediction

class SASRec(nn.Module):
    def __init__(self, n_items, d_model=64, n_heads=2, n_layers=2):
        self.item_emb = nn.Embedding(n_items, d_model)
        self.pos_emb = nn.Embedding(max_len, d_model)
        self.transformer = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(d_model, n_heads, dim_feedforward=128),
            num_layers=n_layers
        )
        # Causal mask: only attend to past items

    def forward(self, item_seq):
        emb = self.item_emb(item_seq) + self.pos_emb(positions)
        out = self.transformer(emb, mask=causal_mask)
        return out[:, -1, :]  # last position → predict next item
```

### Recall Engineering
- **Multiple channels**: Combine ItemCF + DSSM + SASRec + hot/new items
- **ANN indexing**: FAISS (IVF-PQ), Milvus, ScaNN for sub-millisecond retrieval
- **Negative sampling**: In-batch negatives, hard negatives (semi-hard mining)
- **Feature engineering**: User history embedding, real-time features via feature store

---

## Stage 3: Ranking (Fine Ranking)

Score each candidate with rich features. This is where most model innovation happens.

### CTR Prediction Models (Evolution)

| Model | Key Innovation | Year | Origin |
|-------|---------------|------|--------|
| **LR** | Sparse features, manual cross | Pre-2014 | Industry baseline |
| **GBDT + LR** | Tree features → logistic regression | 2014 | Facebook |
| **FM / FFM** | Learnable 2nd-order feature interactions | 2010/2016 | Rendle |
| **Wide & Deep** | Wide (memorization) + Deep (generalization) | 2016 | Google |
| **DeepFM** | FM layer + DNN, no manual feature engineering | 2017 | Huawei |
| **DCN** | Cross Network for explicit feature crossing | 2017 | Google |
| **DCN V2** | Low-rank cross network, mixture of experts | 2020 | Google |
| **xDeepFM** | Compressed Interaction Network (CIN) | 2018 | Microsoft |
| **DIN** | Attention on user history w.r.t. target item | 2018 | Alibaba |
| **DIEN** | GRU + attention for interest evolution | 2019 | Alibaba |
| **BST** | Transformer on user behavior sequence | 2019 | Alibaba |
| **SIM** | Search-based Interest Model (long history) | 2020 | Alibaba |
| **DLRM** | Embedding + MLP + feature interaction | 2019 | Meta |
| **MaskNet** | Instance-guided mask for feature importance | 2021 | Sina Weibo |
| **FinalMLP** | Two-stream MLP with bilinear fusion | 2023 | Huawei |

### DIN (Deep Interest Network) — Detail

```python
# Key insight: user's interest is diverse — not all history items
# are equally relevant to the current candidate item.
# Solution: attention-weighted pooling of user behavior sequence.

class DIN(nn.Module):
    """
    Attention mechanism: for candidate item c and history [h1, h2, ...],
    compute attention weights α_i = f(h_i, c) and aggregate:
    user_interest = Σ α_i * emb(h_i)
    """
    def attention(self, query, keys, keys_length):
        # query: candidate item embedding [B, D]
        # keys: user behavior sequence embeddings [B, T, D]
        queries = query.unsqueeze(1).expand_as(keys)  # [B, T, D]
        att_input = torch.cat([queries, keys, queries - keys,
                               queries * keys], dim=-1)  # [B, T, 4D]
        att_score = self.att_mlp(att_input).squeeze(-1)  # [B, T]
        # Mask padding positions
        mask = sequence_mask(keys_length)
        att_score = att_score.masked_fill(~mask, -1e9)
        att_weight = F.softmax(att_score, dim=-1)  # [B, T]
        output = torch.bmm(att_weight.unsqueeze(1), keys)  # [B, 1, D]
        return output.squeeze(1)
```

**DIN → DIEN evolution**: DIEN adds a GRU layer to model *interest evolution* (how user interests change over time), plus an auxiliary loss on the GRU hidden states for better training.

### DIEN (Deep Interest Evolution Network) — Detail

```
Architecture:
  1. Behavior Layer: Item embeddings of user history
  2. Interest Extractor: GRU captures sequential dependencies
     └─ Auxiliary loss: predict next click from GRU hidden states
  3. Interest Evolution: AUGRU (GRU with attention update gate)
     └─ Attention from target item modulates GRU gates
     └─ Models how interest EVOLVES toward the target item
  4. MLP: Concat evolved interest + user/context features → CTR
```

### BST (Behavior Sequence Transformer) — Detail

```
Key idea: Replace GRU in DIEN with multi-head self-attention (Transformer)
  - Better at capturing long-range dependencies in behavior sequences
  - Positional encoding: use time interval between actions (not just position)
  - Typically 1-2 Transformer layers with 4-8 heads

Architecture:
  User behavior [item_1, ..., item_n] + target item
  → Item embeddings + positional encoding
  → Transformer Encoder (self-attention, causal optional)
  → Pooling (CLS token or attention-weighted)
  → Concat with other features → MLP → CTR
```

### DCN V2 (Deep & Cross Network V2) — Detail

```
Cross Network: Explicit feature interactions up to L-th order
  x_{l+1} = x_0 ⊙ (W_l · x_l + b_l) + x_l

Improvements over DCN V1:
  - Low-rank parameterization: W = U · V^T (reduces parameters)
  - Mixture of experts: multiple cross experts + gating network
  - Stacked or parallel with DNN
```

---

## Stage 4: Re-Ranking & Multi-Task Learning

Optimize for multiple objectives simultaneously and apply diversity/business constraints.

### Multi-Task Learning Models

| Model | Architecture | Key Idea | Year |
|-------|-------------|----------|------|
| **Shared-Bottom** | Shared layers + task-specific towers | Simple, but negative transfer | Baseline |
| **MMOE** | Multiple expert networks + per-task gating | Each task selects experts via softmax gate | Google, 2018 |
| **PLE** | Progressive Layered Extraction | Shared + task-specific experts at each layer + progressive routing | Tencent, 2020 |
| **ESMM** | Entire Space Multi-Task Model | P(conversion) = P(click) × P(conversion\|click) | Alibaba, 2018 |
| **MetaBalance** | Meta-learning for task balancing | Automatically balance gradient magnitudes | 2022 |

### MMOE (Multi-gate Mixture-of-Experts) — Detail

```python
# Key insight: different tasks need different feature representations.
# Solution: multiple expert networks with task-specific gating.

class MMOE(nn.Module):
    def __init__(self, input_dim, n_experts=8, expert_dim=64, n_tasks=2):
        # Shared expert networks
        self.experts = nn.ModuleList([
            nn.Sequential(nn.Linear(input_dim, expert_dim), nn.ReLU())
            for _ in range(n_experts)
        ])
        # Per-task gating networks
        self.gates = nn.ModuleList([
            nn.Linear(input_dim, n_experts)
            for _ in range(n_tasks)
        ])
        # Task-specific towers
        self.towers = nn.ModuleList([
            nn.Sequential(nn.Linear(expert_dim, 32), nn.ReLU(), nn.Linear(32, 1))
            for _ in range(n_tasks)
        ])

    def forward(self, x):
        expert_outs = [expert(x) for expert in self.experts]  # [n_experts, B, D]
        expert_outs = torch.stack(expert_outs, dim=1)         # [B, n_experts, D]

        task_outputs = []
        for i, (gate, tower) in enumerate(zip(self.gates, self.towers)):
            gate_weight = F.softmax(gate(x), dim=-1)          # [B, n_experts]
            gate_out = torch.bmm(gate_weight.unsqueeze(1),
                                 expert_outs).squeeze(1)       # [B, D]
            task_outputs.append(tower(gate_out))
        return task_outputs  # [task1_pred, task2_pred]
```

### PLE (Progressive Layered Extraction) — Detail

```
Evolution: Shared-Bottom → MMOE → PLE

PLE improvements over MMOE:
  1. Task-specific experts: Each task has its OWN experts + shared experts
  2. Progressive routing: Multi-level extraction (stacked MMOE layers)
  3. Reduces "seesaw phenomenon" (improving one task hurts another)

Architecture (2-task example):
  Layer L:
    Shared experts: [E_s1, E_s2, E_s3]      (shared across tasks)
    Task A experts: [E_a1, E_a2]              (only for task A)
    Task B experts: [E_b1, E_b2]              (only for task B)
    Gate A: selects from [E_s1..3, E_a1..2]   → Task A representation
    Gate B: selects from [E_s1..3, E_b1..2]   → Task B representation

  Layer L+1: Same structure, input from Layer L gates
  Progressive refinement across layers
```

### Re-Ranking Strategies
- **DPP (Determinantal Point Process)**: Maximize diversity in final list
- **MMR (Maximal Marginal Relevance)**: Balance relevance and diversity
- **Business rules**: Mix in new items, boost sponsored content, frequency capping
- **Slate optimization**: Optimize the whole list, not individual items
- **Context-aware re-ranking**: Consider position bias, device, time-of-day

---

## Feature Engineering for Recommendation

### Feature Categories

| Category | Examples | Encoding |
|----------|---------|----------|
| **User profile** | age, gender, city, membership | Embedding |
| **Item attributes** | category, brand, price, tags | Embedding |
| **User behavior** | last N clicks, purchases, searches | Sequence embedding (DIN/BST) |
| **Context** | time, device, location, position | Embedding + bucketize |
| **Cross features** | user×item category, history overlap | Explicit cross or learned |
| **Real-time** | session clicks, last 5 min behavior | Feature store (Redis/Feast) |
| **Statistics** | CTR of item, CVR by user segment | Pre-computed, updated hourly |

### Embedding Techniques
- **Sparse features**: Embedding table (vocabulary → dense vector)
- **Multi-hot features**: Pooling (mean/sum/attention) over multiple embeddings
- **Sequence features**: DIN attention / BST transformer / GRU
- **Pre-trained embeddings**: Item2Vec, Node2Vec, BERT embeddings

---

## Serving Architecture

```
┌─────────────────────────────────────────────────┐
│ Online Serving                                   │
│                                                  │
│ Feature Store (Redis/Feast)                      │
│   ├── User features (real-time)                  │
│   ├── Item features (batch updated)              │
│   └── Cross statistics (hourly)                  │
│                                                  │
│ Recall Service                                   │
│   ├── DSSM tower → FAISS/Milvus ANN index       │
│   ├── SASRec → ANN                              │
│   ├── ItemCF → inverted index                    │
│   └── Hot/New item channel                       │
│                                                  │
│ Ranking Service                                  │
│   ├── Feature assembly (<5ms)                    │
│   ├── Model inference (TensorRT/ONNX) (<20ms)   │
│   └── Score fusion + calibration                 │
│                                                  │
│ Re-Ranking Service                               │
│   ├── Multi-objective optimization               │
│   ├── Diversity (DPP/MMR)                        │
│   └── Business rules + A/B test splitter         │
│                                                  │
│ Total latency budget: <200ms end-to-end          │
└─────────────────────────────────────────────────┘
```

## Usage Examples

```
"Build a video recommendation system for our app — we have 10M videos
and 50M users with click/watch/like signals"
→ DSSM + SASRec (recall) → DCN V2 (ranking) → PLE for CTR + watch time
  multi-task → DPP re-ranking for diversity
```

```
"Add deep ranking to our e-commerce search — we currently use XGBoost"
→ Start with DeepFM as baseline, then DIN for behavior attention,
  BST if sequence length > 50. Use MMOE for CTR + CVR multi-task.
```

```
"Our recommendation system has a 'filter bubble' problem —
users keep seeing the same categories"
→ Add DPP diversity re-ranking, exploration channels in recall,
  category-aware negative sampling, position-debiased training
```

## Output Format

- **System Architecture**: Multi-stage pipeline with model choices per stage
- **Model Code**: PyTorch implementation with training loop
- **Feature Schema**: Feature list with types and encoding strategy
- **Offline Evaluation**: AUC, GAUC, NDCG, HitRate@K metrics
- **Online Metrics**: CTR, CVR, GMV, diversity, coverage, novelty
- **Serving Design**: Latency budget, ANN index, feature store

---

### Key References
- Zhou et al. (2018) — *DIN: Deep Interest Network for Click-Through Rate Prediction* (Alibaba)
- Zhou et al. (2019) — *DIEN: Deep Interest Evolution Network* (Alibaba)
- Chen et al. (2019) — *BST: Behavior Sequence Transformer for E-commerce Recommendation* (Alibaba)
- Wang et al. (2021) — *DCN V2: Improved Deep & Cross Network* (Google)
- Ma et al. (2018) — *MMOE: Modeling Task Relationships in Multi-Task Learning* (Google)
- Tang et al. (2020) — *PLE: Progressive Layered Extraction for Multi-Task Learning* (Tencent)
- Huang et al. (2013) — *DSSM: Learning Deep Structured Semantic Models* (Microsoft)
- Kang & McAuley (2018) — *SASRec: Self-Attentive Sequential Recommendation* (UCSD)
- Pi et al. (2020) — *SIM: Search-based Interest Model* (Alibaba)
- Guo et al. (2017) — *DeepFM: A Factorization-Machine based Neural Network* (Huawei)
