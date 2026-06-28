---
name: 神经网络设计
description: "设计最先进的神经网络架构：表格数据用 TabNet/TabPFN，图像用 Vision Transformer/ConvNeXt V2，序列用 Mamba/RWKV 状态空间模型，混合专家模型、扩散模型和多模态架构。包含 Flash Attention、LoRA、量化和现代训练方法。适用于为任何模态设计神经网络。"
---

# Neural Network Design

## Purpose
Design production-grade neural architectures using the latest SOTA techniques from top ML labs.

## How It Works

### Architecture Selection (2024-2026 SOTA)

| Problem | SOTA Architecture | Why |
|---------|-------------------|-----|
| **Tabular** | TabPFN, XGBoost, TabNet, FT-Transformer | TabPFN: zero-shot, no tuning; FT-Transformer: attention on features |
| **Images** | ConvNeXt V2, DINOv2, EVA-02, SigLIP | DINOv2: best self-supervised; SigLIP: multimodal alignment |
| **Text** | Llama 3, Mistral, Qwen 2.5, Gemma 2 | Open-weight LLMs for fine-tuning |
| **Sequences** | Mamba-2, RWKV-6, xLSTM, Hyena | State space models: O(n) vs O(n²) attention |
| **Audio** | Whisper v3, Encodec, VALL-E | Whisper: robust ASR; Encodec: neural audio codec |
| **Video** | VideoMAE v2, InternVideo2, Sora-like diffusion | Temporal understanding + generation |
| **Multimodal** | LLaVA-NeXT, GPT-4V architecture, Gemini pattern | Vision encoder + LLM backbone + projection |
| **Generation** | Stable Diffusion 3, FLUX, Consistency Models | Flow matching > DDPM; Consistency: single-step |
| **Graph** | GPS (General Powerful Scalable), GraphMAE | Positional encodings + attention on graphs |

### Modern Building Blocks

#### Attention Variants
```
Standard Self-Attention:   O(n²) memory — vanilla transformer
Flash Attention v2:        O(n) memory — fused CUDA kernel, 2-3x faster
Grouped Query Attention:   Share KV heads across Q heads (Llama 2+)
Sliding Window Attention:  Local context + global tokens (Mistral)
Linear Attention:          O(n) via kernel approximation (Performer, RWKV)
Ring Attention:            Distribute context across GPUs for >1M tokens
```

#### Normalization & Activation
- **RMSNorm** > LayerNorm (simpler, equally effective — Llama, Mistral)
- **SwiGLU** > GELU > ReLU (gated activation, +1-3% on LLMs)
- **Rotary Position Embedding (RoPE)**: Relative positions via rotation matrices

#### Efficient Architectures
- **Mixture of Experts (MoE)**: Route tokens to specialized sub-networks (Mixtral, Switch Transformer)
  - 8 experts, top-2 routing → 8x parameters at 2x compute
- **State Space Models**: Mamba — selective scan, hardware-aware, O(n)
  - Better than Transformers on long sequences (>8K tokens)
- **Hybrid architectures**: Mamba + Attention layers (Jamba, Zamba)

### Tabular Deep Learning (Often Overlooked)

| Model | Type | When |
|-------|------|------|
| **TabPFN** | In-context learning | <10K rows, <100 features, no tuning needed |
| **FT-Transformer** | Feature Tokenizer + Transformer | Medium data, interpretability via attention |
| **TabNet** | Sequential attention | Feature selection built-in |
| **SAINT** | Self-Attention + Inter-sample Attention | Row + column interactions |
| **XGBoost/LightGBM** | Gradient boosting (still SOTA baseline!) | >10K rows, categorical-heavy |
| **CatBoost** | Ordered boosting | High cardinality categoricals |

**Reality check**: On most Kaggle tabular benchmarks, well-tuned XGBoost still beats deep learning. Use DL for tabular only when: multi-modal inputs, pre-training benefits, or entity embeddings add value.

### Training Recipe (Modern Best Practices)

```python
# Production Training Config (2025 Standard)
config = {
    "optimizer": "AdamW",           # or Adafactor for memory savings
    "lr": 3e-4,                     # base LR; scale with batch size
    "lr_schedule": "cosine_with_warmup",
    "warmup_ratio": 0.06,           # 6% of total steps
    "weight_decay": 0.1,            # decouple from LR
    "grad_clip": 1.0,               # gradient clipping norm
    "precision": "bf16",            # bfloat16 > fp16 (no loss scaling needed)
    "compile": True,                # torch.compile for 20-30% speedup
    "gradient_checkpointing": True, # trade compute for memory
    "fsdp": True,                   # Fully Sharded Data Parallel for multi-GPU
    "activation": "swiglu",
    "norm": "rmsnorm",
    "pos_encoding": "rope",
}
```

### Parameter-Efficient Fine-Tuning (PEFT)

| Method | Trainable Params | Memory | When |
|--------|-----------------|--------|------|
| **Full fine-tuning** | 100% | High | Lots of data, large GPU |
| **LoRA** | 0.1-1% | Low | Standard PEFT, most cases |
| **QLoRA** | 0.1-1% | Very low | Fine-tune 70B on single GPU |
| **DoRA** | 0.1-1% | Low | Better than LoRA on some tasks |
| **Prefix tuning** | <0.1% | Very low | Prompt-like, simple tasks |
| **Adapters** | 1-5% | Low | Multi-task, switching |

## Usage Examples

```
"Design a multimodal model that takes product images + descriptions
and predicts category — I have 50K labeled examples"
```

```
"What's the best architecture for processing 100K-token documents?
Transformer attention is too expensive."
```

## Output Format

- **Architecture**: Layer-by-layer spec with modern components
- **Training Recipe**: Optimizer, scheduler, precision, parallelism
- **Hardware Estimate**: GPU memory, training time, cost
- **PyTorch Code**: Complete model + training loop with torch.compile
- **Alternatives**: Trade-off analysis (speed vs. quality vs. cost)

---

### Key References
- Gu & Dao (2023) — *Mamba: Linear-Time Sequence Modeling with Selective State Spaces*
- Dao (2023) — *FlashAttention-2: Faster Attention with Better Parallelism*
- Hollmann et al. (2023) — *TabPFN: A Transformer That Solves Small Tabular Classification Problems in a Second*
- Fedus et al. (2022) — *Switch Transformers: Scaling to Trillion Parameter Models*
