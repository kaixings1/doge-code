---
name: AI/ML 攻击面
description: "用于 AI/ML 安全审计的技能。识别提示注入、模型反序列化、不安全模型加载、Jupyter 注入等机器学习框架中的安全漏洞。"
version: 1.0.0
---

# AI/ML 攻击面

## Purpose

Detect security vulnerabilities specific to AI/ML pipelines, LLM-backed applications, and data science workflows. These attack surfaces are increasingly common and often overlooked by traditional SAST tools.

## When to Use

Activate this skill when reviewing code that:
- Imports ML frameworks (torch, tensorflow, sklearn, transformers, langchain)
- Loads serialized models or data
- Integrates LLM APIs (OpenAI, Anthropic, etc.)
- Processes Jupyter notebooks
- Handles training data pipelines

## Vulnerability Categories

### 1. Unsafe Deserialization in ML Pipelines (CWE-502)

The most critical ML-specific vulnerability. Many ML serialization formats execute arbitrary code on load.

**Dangerous Functions:**

| Framework | Dangerous | Safe Alternative |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 11 MINUTES 32 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE