---
name: llm-prompt-optimizer
description: "适用于improving prompts for any llm. applies proven prompt engineering techniques to boost output quality, reduce hallucinations, and cut token usage.的情况。"
risk: safe
source: community
date_added: "2026-03-04"
---

# LLM 提示词优化器

## 概述

此技能将薄弱、模糊或不一致的提示词转化为精确设计的指令，可靠地产生来自任何 LLM（Claude、Gemini、GPT-4、Llama 等）的高质量输出。它应用系统化的提示工程框架——从零样本到少样本、思维链和结构化输出模式。

## 何时使用此技能

- 当提示词返回不一致、模糊或幻觉结果时使用
- 当需要从 LLM 可靠地获取结构化/JSON 输出时使用
- 当为 AI 代理或聊天机器人设计系统提示词时使用
- 当希望在不牺牲质量的情况下减少 token 使用时使用
- Use when implementing chain-of-thought reasoning for complex tasks
- Use when prompts work on one model but fail on another

## Step-by-Step Guide

### 1. Diagnose the Weak Prompt

Before optimizing, identify which problem pattern applies:

| Problem | Symptom | Fix |