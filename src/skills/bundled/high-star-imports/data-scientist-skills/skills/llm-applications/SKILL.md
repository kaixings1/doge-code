---
name: llm-applications
description: "Build production LLM applications using SOTA techniques: structured outputs, function calling, multi-agent systems, RAG with reranking and hybrid search, advanced prompting (CoT, ToT, ReAct), fine-tuning with DPO/ORPO, evaluation with LLM judges, and guardrails. Covers OpenAI, Anthropic, open-weight models (Llama, Mistral, Qwen), and orchestration frameworks. Use when building any LLM-powered application."
---

# LLM Applications

## Purpose
Design and build production-grade LLM applications using the latest techniques from industry and research.

## How It Works

### Application Architecture Patterns (2025)

| Pattern | Use Case | Stack |
|---------|----------|-------|
| **Prompt engineering** | Simple classification, extraction, generation | Direct API |
| **RAG** | Document Q&A, knowledge bases, search | Vector DB + LLM |
| **Agentic RAG** | Complex research, multi-doc reasoning | LangGraph, CrewAI |
| **Fine-tuning** | Domain-specific tasks, style, format compliance | LoRA/QLoRA + SFT |
| **Multi-agent** | Complex workflows, code generation, analysis | LangGraph, AutoGen |
| **Structured output** | Data extraction, form filling, API responses | JSON mode, tool use |

### Advanced Prompting Techniques

| Technique | When | How |
|-----------|------|-----|
| **Chain-of-Thought (CoT)** | Reasoning, math, logic | "Think step by step" |
| **Tree-of-Thought (ToT)** | Complex planning | Explore multiple reasoning paths |
| **ReAct** | Tool use, multi-step tasks | Reason → Act → Observe loop |
| **Self-consistency** | Reduce errors | Sample multiple CoT, majority vote |
| **Structured output** | Data extraction | JSON schema, Pydantic models |
| **Few-shot with retrieval** | Dynamic examples | Retrieve similar examples from DB |

### RAG Design (Production-Grade)

```
Document Ingestion:
  Raw docs → Chunking (semantic/recursive) → Embeddings → Vector DB

Retrieval:
  Query → Embed → Hybrid search (dense + BM25)
       → Reranking (cross-encoder / Cohere Rerank)
       → Context assembly (lost-in-the-middle aware)

Generation:
  System prompt + retrieved context + query
  → LLM with citation tracking
  → Hallucination check (claim verification)
```

**SOTA Retrieval Stack:**
- **Embeddings**: Cohere embed-v3, E5-Mistral, BGE-M3 (multilingual)
- **Vector DB**: Qdrant, Weaviate, Pinecone (managed), pgvector (simple)
- **Reranking**: Cohere Rerank, cross-encoder/ms-marco-MiniLM
- **Hybrid**: BM25 + dense with Reciprocal Rank Fusion (RRF)
- **Chunking**: Semantic chunking > recursive > fixed-size

### Fine-Tuning (Modern Approaches)

| Method | What It Does | When |
|--------|-------------|------|
| **SFT (Supervised Fine-Tuning)** | Learn task format/style | First step — instruction tuning |
| **DPO (Direct Preference Optimization)** | Align to preferences without RL | Preferred over RLHF — simpler, more stable |
| **ORPO (Odds Ratio Preference Optimization)** | SFT + alignment in one step | Fewer resources than DPO |
| **SimPO** | Simple preference optimization | Latest, no reference model needed |
| **LoRA/QLoRA** | Parameter-efficient fine-tuning | Standard for <70B models |
| **Unsloth** | 2x faster LoRA, 70% less memory | Open-source acceleration |

### Evaluation (Critical for Production)

| What to Evaluate | Method |
|-----------------|--------|
| **Task accuracy** | Ground-truth comparison (F1, exact match) |
| **Faithfulness** | Does output match retrieved context? (RAGAS) |
| **Hallucination** | Claim verification against sources |
| **Relevance** | Are retrieved docs relevant? (nDCG, MRR) |
| **Safety** | Jailbreak resistance, harmful output detection |
| **LLM-as-Judge** | Stronger model evaluates weaker model outputs |
| **Human eval** | Preference ranking, Likert rating (gold standard) |

**Tools**: RAGAS, DeepEval, LangSmith, Braintrust, Phoenix (Arize)

### Production Guardrails
- Input: PII detection, prompt injection defense, content filtering
- Output: JSON validation, citation verification, toxicity filtering
- Observability: LangSmith, Langfuse, Phoenix for tracing
- Cost: Token budgets, caching (semantic cache), model routing

### Model Selection (2025)

| Use Case | Best Open Model | Best API |
|----------|----------------|----------|
| General | Llama 3.1 70B, Qwen 2.5 72B | GPT-4o, Claude 3.5 Sonnet |
| Coding | DeepSeek-Coder V2, Qwen2.5-Coder | Claude 3.5 Sonnet, GPT-4o |
| Small/Edge | Llama 3.2 3B, Phi-3.5-mini, Gemma 2 2B | GPT-4o-mini, Claude Haiku |
| Vision | LLaVA-NeXT, InternVL 2.5, Qwen-VL | GPT-4o, Claude 3.5 Sonnet |
| Embeddings | BGE-M3, E5-Mistral | Cohere embed-v3, OpenAI text-embedding-3 |

## Usage Examples

```
"Build a RAG system for 10K legal documents with high accuracy requirements —
we need source citations and can't tolerate hallucination"
→ Hybrid retrieval + semantic chunking + Cohere Rerank + Claude Sonnet
  with claim verification guardrail
```

```
"Fine-tune Llama 3.1 8B for classifying medical reports into ICD codes
using 5000 labeled examples"
→ QLoRA fine-tuning with Unsloth + DPO alignment + RAGAS evaluation
```

## Output Format

- **Architecture Diagram**: System components and data flow
- **Implementation Code**: LangChain / LlamaIndex / raw API with best practices
- **Evaluation Suite**: Test cases, metrics, evaluation pipeline
- **Cost Analysis**: Token usage, API costs, GPU requirements
- **Deployment Plan**: API serving, caching, monitoring

---

### Key References
- Lewis et al. (2020) — *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*
- Rafailov et al. (2023) — *Direct Preference Optimization (DPO)*
- Gao et al. (2023) — *Retrieval-Augmented Generation for Large Language Models: A Survey*
- Shinn et al. (2023) — *Reflexion: Language Agents with Verbal Reinforcement Learning*
