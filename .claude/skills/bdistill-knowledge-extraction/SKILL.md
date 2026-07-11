---
name: 结构化知识提取
description: "从 AI 模型中提取结构化领域知识，可在会话中或通过 Ollama 从本地开源模型中提取。无需 API 密钥。"
category: ai-research
risk: safe
source: community
date_added: "2026-03-20"
author: FrancyJGLisboa
tags: [ai, knowledge-extraction, domain-specific, data-moat, mcp, reference-data]
tools: [claude, cursor, codex, copilot]
---

# Knowledge Extraction

Extract structured, quality-scored domain knowledge from any AI model — in-会话 from closed models (no API key) or locally from open-source models via Ollama.

## 概述

bdistill turns your AI subscription sessions into a compounding knowledge base. The agent answers targeted domain questions, bdistill structures and quality-scores the responses, and the output accumulates into a searchable, exportable reference dataset.

Adversarial mode challenges the agent's claims — forcing evidence, corrections, and acknowledged limitations — producing validated knowledge entries.

## /u4f55/u65f6/u4f7f/u7528 This Skill

- Use when you need structured reference data on any domain (medical, legal, finance, cybersecurity)
- Use when building lookup tables, Q&A datasets, or research corpora
- Use when generating training data for traditional ML models (regression, classification — NOT competing LLMs)
- Use when you want cross-model comparison on domain knowledge

## 工作原理

### 步骤 1: Install

```bash
pip install bdistill
claude mcp add bdistill -- bdistill-mcp   # Claude Code
```

### 步骤 2: Extract knowledge in-会话

```
/distill medical cardiology                    # Preset domain
/distill --custom kubernetes docker helm       # Custom terms
/distill --adversarial medical                 # With adversarial validation
```

### 步骤 3: Search, export, compound

```bash
bdistill kb list                               # Show all domains
bdistill kb search "atrial fibrillation"       # Keyword search
bdistill kb export -d medical -f csv           # Export as spreadsheet
bdistill kb export -d medical -f markdown      # Readable knowledge document
```

## 输出格式

Structured reference JSONL — not training data:

```json
{
  "question": "What causes myocardial infarction?",
  "answer": "Myocardial infarction results from acute coronary artery occlusion...",
  "domain": "medical",
  "category": "cardiology",
  "tags": ["mechanistic", "evidence-based"],
  "quality_score": 0.73,
  "confidence": 1.08,
  "validated": true,
  "source_model": "Claude Sonnet 4"
}
```

## Tabular ML Data Generation

Generate structured training data for traditional ML models:

```
/架构 sepsis | hr:float, bp:float, temp:float, wbc:float | risk:category[low,moderate,high,critical]
```

Exports as CSV ready for pandas/sklearn. Each row tracks source_model for cross-model analysis.

## Local Model Extraction (Ollama)

For open-source models running locally:

```bash
# Install Ollama from https://ollama.com
ollama serve
ollama pull qwen3:4b

bdistill extract --domain medical --model qwen3:4b
```

## 安全与安全注意事项

- In-会话 extraction uses your existing subscription — no additional API keys
- Local extraction runs entirely on your machine via Ollama
- No data is sent to external services
- Output is reference data, not LLM training format

## 相关技能

- `@bdistill-behavioral-xray` - X-ray a model's behavioral patterns

## /u9650/u5236
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
