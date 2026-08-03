---
name: transfer-learning
description: "Fine-tune SOTA pretrained models: LoRA/QLoRA/DoRA for parameter-efficient tuning, DPO/ORPO for alignment, Unsloth for 2x speedup, DINOv2/SigLIP for vision, ModernBERT/DeBERTa for NLP, and foundation model adaptation strategies. Includes multi-stage fine-tuning and continued pre-training. Use when adapting powerful pretrained models to your task."
---

# Transfer Learning

## Purpose
Adapt state-of-the-art pretrained models to your specific task with modern fine-tuning techniques.

## How It Works

### Step 1: Choose Base Model (2025 SOTA)

| Domain | Model | Params | Strengths |
|--------|-------|--------|-----------|
| **NLP — Encoder** | ModernBERT, DeBERTa-v3 | 110M-400M | Classification, NER, best encoder-only |
| **NLP — Decoder** | Llama 3.1, Mistral, Qwen 2.5 | 1B-70B | Generation, instruction following |
| **NLP — Few-shot** | SetFit, Sentence-T5 | 110M | Need <100 labeled examples |
| **Vision — General** | DINOv2, EVA-02 | 300M-1B | Self-supervised, best features |
| **Vision — Classification** | ConvNeXt V2, EfficientNet V2 | 20M-300M | Efficient, well-understood |
| **Vision — Detection** | Co-DETR, YOLOv10 | 30M-200M | SOTA detection accuracy and speed |
| **Vision — Segmentation** | SAM 2 | 300M | Promptable, zero-shot segmentation |
| **Multimodal** | SigLIP, CLIP ViT-L | 400M-1B | Image-text alignment |
| **Audio** | Whisper v3 Large | 1.5B | Multilingual ASR |
| **Code** | DeepSeek-Coder V2, Qwen2.5-Coder | 7B-33B | Code generation, understanding |

### Step 2: Choose Fine-Tuning Strategy

| Strategy | Trainable | Memory | Best When |
|----------|-----------|--------|-----------|
| **Linear probe** | Head only (0.01%) | Minimal | Quick baseline, abundant features |
| **LoRA** (r=16-64) | 0.1-1% | Low | Standard PEFT, most cases |
| **QLoRA** (4-bit base) | 0.1-1% | Very low | Fine-tune 70B on 24GB GPU |
| **DoRA** | 0.1-1% | Low | Better than LoRA, slight overhead |
| **Full fine-tuning** | 100% | High | Lots of data, full GPU cluster |
| **Continued pre-training** | 100% | High | Domain adaptation (medical, legal) |

#### LoRA Configuration Guide
```python
# LoRA config (practical defaults)
peft_config = LoraConfig(
    r=32,                    # Rank: 16-64 (higher = more capacity)
    lora_alpha=64,           # Alpha: usually 2x rank
    target_modules=[         # Apply to attention + MLP
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",   # or SEQ_CLS, TOKEN_CLS
)
```

### Step 3: Multi-Stage Fine-Tuning (Industry Best Practice)

```
Stage 1: Continued Pre-Training (optional)
  └─ Domain-specific corpus (medical papers, legal docs)
  └─ Same objective as pre-training (CLM or MLM)
  └─ Lower LR (1e-5), longer training

Stage 2: Supervised Fine-Tuning (SFT)
  └─ Task-specific labeled data
  └─ Instruction-tuning format
  └─ LR: 2e-5 for encoders, 1e-4 for LoRA

Stage 3: Preference Alignment (optional)
  └─ DPO/ORPO with preference pairs
  └─ Improves output quality beyond SFT
  └─ Need ~1K preference pairs
```

### Step 4: Training Configuration
```python
# Modern training recipe
training_args = {
    "learning_rate": 2e-4,          # for LoRA (1e-5 for full FT)
    "lr_scheduler_type": "cosine",
    "warmup_ratio": 0.06,
    "num_train_epochs": 3,          # 1-5 for fine-tuning
    "per_device_train_batch_size": 4,
    "gradient_accumulation_steps": 8,  # effective batch = 32
    "bf16": True,                   # bfloat16 (no loss scaling!)
    "optim": "adamw_torch_fused",   # or paged_adamw_8bit for QLoRA
    "max_grad_norm": 1.0,
    "weight_decay": 0.01,
}
```

### Step 5: Evaluate & Avoid Pitfalls
- **Catastrophic forgetting**: Evaluate on general benchmarks before/after
- **Overfitting**: Monitor train/val loss divergence, use early stopping
- **Data contamination**: Ensure test data not in training set
- **Checkpoint selection**: Best val loss ≠ best downstream performance

## Usage Examples

```
"Fine-tune DeBERTa-v3 for classifying 50K customer feedback messages
into 12 categories — I need >95% accuracy"
→ Full fine-tuning with lr=2e-5, cosine schedule, 5 epochs
  Cross-validation to estimate production performance
```

```
"Adapt Llama 3.1 8B for our internal code review assistant
with 3000 review examples on a single A100"
→ QLoRA (r=32) with Unsloth for 2x speedup
  SFT first, then DPO with preference pairs
```

## Output Format

- **Model Selection**: Base model with rationale
- **PEFT Config**: LoRA rank, targets, and training hyperparameters
- **Training Code**: HuggingFace Trainer / Unsloth implementation
- **Evaluation**: Before/after comparison on benchmarks
- **Deployment**: Model merging, quantization, ONNX export

---

### Key References
- Hu et al. (2021) — *LoRA: Low-Rank Adaptation of Large Language Models*
- Dettmers et al. (2023) — *QLoRA: Efficient Finetuning of Quantized LLMs*
- Liu et al. (2024) — *DoRA: Weight-Decomposed Low-Rank Adaptation*
- Rafailov et al. (2023) — *DPO: Direct Preference Optimization*
