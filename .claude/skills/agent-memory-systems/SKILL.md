---
name: 代理记忆系统
description: "Agent 记忆系统 — AI 代理记忆系统架构：短期（上下文窗口）、长期（向量存储）以及组织它们的认知架构之间的互动。"
risk: safe
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# Agent Memory Systems

Memory is the cornerstone of intelligent agents. Without it, every interaction
starts from zero. This skill covers the architecture of agent memory: short-term
(context window), long-term (vector stores), and the cognitive architectures
that organize them.

Key insight: Memory isn't just storage - it's retrieval. A million stored facts
mean nothing if you can't find the right one. Chunking, embedding, and retrieval
strategies determine whether your agent remembers or forgets.

The field is fragmented with inconsistent terminology. We use the CoALA cognitive
architecture framework: semantic memory (facts), episodic memory (experiences),
and procedural memory (how-to knowledge).

## 原则

- Memory quality = retrieval quality, not storage quantity
- Chunk for retrieval, not for storage
- 上下文 isolation is the enemy of memory
- Right memory type for right information
- Decay old memories - not everything should be forever
- Test retrieval accuracy before production
- Background memory formation beats real-time

## 能力

- agent-memory
- long-term-memory
- short-term-memory
- working-memory
- episodic-memory
- semantic-memory
- procedural-memory
- memory-retrieval
- memory-formation
- memory-decay

## 范围

- vector-database-operations → data-engineer
- rag-pipeline-architecture → llm-architect
- embedding-model-selection → ml-engineer
- knowledge-graph-design → knowledge-engineer

## 工具

### Memory_frameworks

- LangMem (LangChain) - When: LangGraph agents with persistent memory 注意: Semantic, episodic, procedural memory types
- MemGPT / Letta - When: Virtual context management, OS-style memory 注意: Hierarchical memory tiers, automatic paging
- Mem0 - When: User memory layer for personalization 注意: Designed for user preferences and history

### Vector_stores

- Pinecone - When: Managed, enterprise-scale (billions of vectors) 注意: Best 查询 performance, highest cost
- Qdrant - When: Complex metadata filtering, open-source 注意: Rust-based, excellent filtering
- Weaviate - When: Hybrid search, knowledge graph features 注意: GraphQL interface, good for relationships
- ChromaDB - When: Prototyping, small/medium apps 注意: Developer-friendly, ~20ms p50 at 100K vectors
- pgvector - When: Already using PostgreSQL, simpler 设置 注意: Good for <1M vectors, familiar tooling

### Embedding_models

- OpenAI text-embedding-3-large - When: Best quality, 3072 dimensions 注意: $0.13/1M tokens
- OpenAI text-embedding-3-small - When: Good balance, 1536 dimensions 注意: $0.02/1M tokens, 5x cheaper
- nomic-embed-text-v1.5 - When: Open-source, local deployment 注意: 768 dimensions, good quality
- all-MiniLM-L6-v2 - When: Lightweight, fast local embedding 注意: 384 dimensions, lowest latency

## 模式

### Memory Type 架构

Choosing the right memory type for different information

**使用场景**: Designing agent memory system

# MEMORY TYPE ARCHITECTURE (CoALA Framework):

"""
Three memory types for different purposes:

1. Semantic Memory: Facts and knowledge
   - What you know about the world
   - User preferences, domain knowledge
   - Stored in profiles (structured) or collections (unstructured)

2. Episodic Memory: Experiences and events
   - What happened (timestamped events)
   - Past conversations, task outcomes
   - Used for learning from experience

3. Procedural Memory: How to do things
   - Rules, skills, workflows
   - Often implemented as few-shot examples
   - "How did I solve this before?"
"""

## LangMem 实现
"""
from langmem import MemoryStore
from langgraph.graph import StateGraph

# Initialize memory store
memory = MemoryStore(
    connection_string=os.environ["POSTGRES_URL"]
)

# Semantic memory: user profile
await memory.semantic.upsert(
    namespace="user_profile",
    key=user_id,
    content={
        "name": "Alice",
        "preferences": ["dark mode", "concise responses"],
        "expertise_level": "developer",
    }
)

# Episodic memory: past interaction
await memory.episodic.add(
    namespace="conversations",
    content={
        "timestamp": datetime.now(),
        "summary": "Helped debug authentication issue",
        "outcome": "resolved",
        "key_insights": ["令牌 expiry was root cause"],
    },
    metadata={"user_id": user_id, "topic": "debugging"}
)

# Procedural memory: learned pattern
await memory.procedural.add(
    namespace="skills",
    content={
        "task_type": "debug_auth",
        "steps": ["Check 令牌 expiry", "Verify refresh flow"],
        "example_interaction": few_shot_example,
    }
)
"""

## Memory Retrieval at Runtime
"""
async def prepare_context(user_id, 查询):
    # Get user profile (semantic)
    profile = await memory.semantic.get(
        namespace="user_profile",
        key=user_id
    )

    # Find relevant past experiences (episodic)
    similar_experiences = await memory.episodic.search(
        namespace="conversations",
        查询=查询,
        过滤器={"user_id": user_id},
        limit=3
    )

    # Find relevant skills (procedural)
    relevant_skills = await memory.procedural.search(
        namespace="skills",
        查询=查询,
        limit=2
    )

    return {
        "profile": profile,
        "past_experiences": similar_experiences,
        "relevant_skills": relevant_skills,
    }
"""

### Vector Store Selection Pattern

Choosing the right vector database for your use case

**使用场景**: Setting up persistent memory storage

# VECTOR STORE SELECTION:

"""
Decision matrix:

|            | Pinecone | Qdrant | Weaviate | ChromaDB | pgvector |