---
name: choose-model
description: "SOTA model selection guide: match your problem type, data size, and constraints to the best algorithm — XGBoost/LightGBM/CatBoost for tabular, TabPFN for small tabular, Transformers for text/vision, state space models for sequences, and modern AutoML. Includes 2025 benchmark results and production trade-offs. Use when deciding which algorithm to try."
---

# Choose Model

## Purpose
Select the right ML/DL algorithm based on current SOTA benchmarks, problem type, data characteristics, and production constraints.

## How It Works

### Master Decision Framework (2025)

#### Tabular Data — Still the Most Common

| Data Size | Best Models | Notes |
|-----------|------------|-------|
| <1K rows | TabPFN (zero-shot!), logistic regression | TabPFN needs no tuning |
| 1K-10K | XGBoost, LightGBM, CatBoost, TabPFN | Gradient boosting dominates |
| 10K-1M | XGBoost, LightGBM, CatBoost | Well-tuned GBDT wins ~90% of Kaggle |
| >1M | LightGBM (fastest), CatBoost, XGBoost | LightGBM: histogram-based, memory efficient |
| High cardinality cats | CatBoost (ordered target encoding) | Handles categoricals natively |
| Many features (>500) | LightGBM + LASSO pre-filter, or FT-Transformer | Feature selection critical |
| Multi-modal (tab+text+img) | Deep learning (multimodal fusion) | Embeddings + tabular features |

**The uncomfortable truth**: On pure tabular data, well-tuned gradient boosting still beats deep learning on most benchmarks (Grinsztajn et al., 2022). Deep learning wins when you have multi-modal data, can pre-train, or need online learning.

#### Text Data

| Task | Best Models (2025) |
|------|-------------------|
| Classification | Fine-tuned DeBERTa-v3, ModernBERT, SetFit (few-shot) |
| Generation | Llama 3.1/3.2, Mistral, Qwen 2.5 (fine-tuned) |
| Embeddings | E5-Mistral, BGE-M3, Nomic-embed |
| NER | GLiNER (zero-shot), fine-tuned DeBERTa |
| Sentiment | Fine-tuned transformer or zero-shot LLM |
| Summarization | Fine-tuned BART/T5, or prompted LLM |

#### Image Data

| Task | Best Models (2025) |
|------|-------------------|
| Classification | DINOv2 + linear probe, ConvNeXt V2, EfficientNet V2 |
| Object detection | YOLOv10, RT-DETR, Co-DETR |
| Segmentation | SAM 2, Mask2Former, OneFormer |
| Generation | FLUX, Stable Diffusion 3, DALL-E 3 |
| OCR/Document | Donut, LayoutLMv3, Florence-2 |

#### Time Series

| Task | Best Models (2025) |
|------|-------------------|
| Forecasting | TimesFM (Google), Chronos (Amazon), Lag-Llama, PatchTST |
| Classification | InceptionTime, ROCKET, Hydra-MR |
| Anomaly detection | TimesNet, Anomaly Transformer |
| Foundation models | TimesFM, Moment, Timer |

**New paradigm**: Foundation models for time series (zero-shot forecasting) — similar to how LLMs changed NLP. TimesFM and Chronos can forecast without training on your specific series.

### Production Constraints Matrix

| Constraint | Best Models |
|-----------|-------------|
| **Must explain predictions** | EBM (Explainable Boosting), logistic regression, SHAP on XGBoost |
| **<10ms latency** | Linear models, distilled models, ONNX-optimized |
| **Runs on CPU** | LightGBM, sklearn models, ONNX Runtime |
| **Runs on edge/mobile** | TFLite, Core ML, ONNX with quantization |
| **Handles concept drift** | Online learning: River, Vowpal Wabbit |
| **Minimal labeled data** | SetFit, TabPFN, zero-shot LLMs, active learning |
| **Real-time streaming** | River, Flink ML, online gradient boosting |

### AutoML (When to Use)

| Tool | Strength | When |
|------|----------|------|
| AutoGluon | Best overall, ensembling | Production baselines |
| FLAML | Fast, resource-aware | Quick experiments |
| Optuna | Flexible HPO | Custom search spaces |
| H2O AutoML | Enterprise, explainability | Regulated industries |
| Auto-sklearn | Meta-learning warm starts | Research |

**Pro tip**: Start with AutoGluon for a strong baseline, then beat it with domain knowledge and feature engineering.

## Usage Examples

```
"I have 50K rows of customer data with 30 features, 15% categorical.
I need to predict churn with explainable predictions. What model?"
→ XGBoost with SHAP. Baseline with AutoGluon. Consider EBM if
  full glass-box interpretability is required.
```

```
"I need to forecast 500 product SKUs daily, with only 6 months of history
per SKU. Some SKUs have very few data points."
→ TimesFM or Chronos (zero-shot foundation model) as baseline.
  LightGBM with lag features for the high-volume SKUs.
```

## Output Format

- **Primary Recommendation**: Model + rationale with expected performance range
- **Alternatives**: 2-3 options with trade-off analysis
- **Baseline Strategy**: Quick baseline (AutoGluon or simple model)
- **Benchmark References**: Papers/competitions proving the recommendation
- **Starter Code**: Production-ready implementation with proper CV

---

### Key References
- Grinsztajn et al. (2022) — *Why do tree-based models still outperform deep learning on tabular data?*
- McElfresh et al. (2023) — *When Do Neural Nets Outperform Boosted Trees on Tabular Data?*
- Erickson et al. (2020) — *AutoGluon-Tabular: Robust and Accurate AutoML for Structured Data*
- Das et al. (2024) — *A Decoder-Only Foundation Model for Time-Series Forecasting (TimesFM)*
