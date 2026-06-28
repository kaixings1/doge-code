---
name: 嵌入向量
description: "使用嵌入向量和向量数据库：选择嵌入模型、构建向量索引、执行相似度搜索和设计检索系统。涵盖 FAISS、ChromaDB、Pinecone、Weaviate 和 Qdrant。适用于构建语义搜索、推荐或 RAG 系统。"
---

# Embeddings & Vector Databases

## Purpose
Choose embedding models, build vector indexes, and design retrieval systems for semantic search and similarity.

## How It Works

### Step 1: Choose Embedding Model

| Use Case | Model | Dimension |
|----------|-------|-----------|
| General text | all-MiniLM-L6-v2 | 384 |
| High quality text | E5-large, BGE-large | 1024 |
| Code | CodeBERT, StarCoder embeddings | 768 |
| Multi-modal | CLIP | 512/768 |
| Multilingual | multilingual-e5 | 768 |

### Step 2: Build Vector Index

| Database | Best For | Type |
|----------|----------|------|
| FAISS | Local, fast, research | In-memory |
| ChromaDB | Local dev, simple API | Embedded |
| Pinecone | Managed, production | Cloud |
| Weaviate | Hybrid search, GraphQL | Self-hosted/Cloud |
| Qdrant | High performance, filtering | Self-hosted/Cloud |
| pgvector | Existing PostgreSQL | Extension |

### Step 3: Retrieval Strategies
- **Dense retrieval**: Pure vector similarity (cosine, L2, inner product)
- **Sparse retrieval**: BM25 keyword matching
- **Hybrid**: Dense + sparse with reciprocal rank fusion
- **Reranking**: Cross-encoder reranker for top-K results
- **Metadata filtering**: Pre-filter by attributes before similarity search

### Step 4: Optimize
- Quantization for memory reduction (PQ, SQ)
- HNSW index for approximate nearest neighbors
- Batch indexing for large collections
- Evaluation: recall@K, MRR, nDCG

## Usage Examples

```
"Build a semantic search system for our 10K product descriptions"
```

```
"Set up ChromaDB locally for a RAG prototype with 500 documents"
```

## Output Format

- **Architecture**: Embedding model + vector DB + retrieval strategy
- **Python Code**: Complete indexing and search implementation
- **Performance**: Latency, recall, storage estimates
- **Scaling Plan**: How to handle growth
