---
name: llm-council
description: "运行 Fireworks 托管的开源模型委员会，比较响应并综合最终答案。"
allowed-tools: Read, Write, Bash, AskUserQuestion
category: "ai-agents"
risk: "safe"
source: "official"
source_repo: "dair-ai/dair-academy-plugins"
source_type: "official"
date_added: "2026-06-19"
author: "DAIR.AI"
license: "MIT"
license_source: "https://github.com/dair-ai/dair-academy-plugins/blob/main/README.md#license"
tags:
  - dair-academy
  - ai
  - 工作流
tools:
  - claude-code
  - codex-cli
  - 游标
---

# LLM 评议会（Fireworks AI）

## 何时使用

当此工作流匹配用户请求时使用：使用此技能执行其文档化的工作流。


_Source: [dair-ai/dair-academy-plugins](https://github.com/dair-ai/dair-academy-plugins) (MIT)._

此技能实现了 Karpathy 的 LLM 评议会概念，其中多个开源权重 LLM 对一个查询进行审议, 完全由 Fireworks AI 提供支持：

1. **阶段 1**：所有模型独立响应查询（并行）
2. **阶段 2**：模型对彼此的匿名响应进行排名
3. **阶段 3**：主席 LLM 综合最终答案

所有推理通过 **Fireworks AI** 使用开放权重模型运行。Fireworks 的速度和定价使得运行多模型审议变得实用，而在其他提供商上这会很慢或昂贵。

## 关键规则

1. **始终使用 AskUserQuestion** 让用户选择评议会模型（多选）和主席模型
2. **始终将原始响应保存到文件** - 绝不总结或截断 API 输出
3. **始终展示完全透明度** - 显示所有个体响应、所有排名以及最终综合
4. **绝不跳过排名阶段** - 这是评议会审议过程的关键
5. **从文件读取以显示** - 确保内容未经修改地展示
6. **始终在阶段 3 完成后向用户显示最终输出**

## 飞行前检查

在运行任何阶段之前，验证 Fireworks API 密钥已设置：

```bash
if [ -z "$FIREWORKS_API_KEY" ]; then
  echo "ERROR: FIREWORKS_API_KEY is not set."
  echo "Create a Fireworks AI account at: https://fireworks.ai/"
  echo "Then export it in your shell profile (~/.zshrc or ~/.bashrc):"
  echo '  export FIREWORKS_API_KEY="your_api_key_here"'
  exit 1
fi
echo "FIREWORKS_API_KEY is set."
```

## 可用模型

通过 AskUserQuestion（多选）向用户展示以下选项：

| Model | Fireworks ID | Provider |
