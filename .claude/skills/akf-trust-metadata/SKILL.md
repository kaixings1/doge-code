---
name: AKF 信任元数据
description: "AI 原生文件格式。AI 的 EXIF — 为每个文件打上信任评分、来源溯源和合规性元数据。嵌入 20+ 种格式（DOCX、PDF、图片、代码）。符合 EU AI Act、SOX、HIPAA 审计要求。"
risk: safe
source: community
date_added: "2026-03-27"
author: HMAKT99
tags:
- trust
- metadata
- provenance
- compliance
- file-format
- ai-native
---

# AKF — The AI Native File Format

Every photo has EXIF. Every song has ID3. AKF is the native metadata format for AI-generated content.

## 使用场景
当您需要对 AI 生成或 AI 修改的文件进行来源和信任元数据的标记、检查或审计，用于合规、审查或交接工作流时使用此技能。

## 创建或修改文件后

```bash
akf stamp <file> --agent <agent-name> --evidence "<what you did>"
```

Evidence examples:
- "generated from user prompt"
- "refactored existing code"
- "tests pass"
- "docs reviewed"

## 修改现有文件前

```bash
akf read <file>          # Check existing trust metadata
akf inspect <file>       # See detailed trust scores
```

## 合规审计

```bash
akf audit <file> --regulation eu_ai_act    # EU AI Act Article 50
akf audit <file> --regulation hipaa         # HIPAA
akf audit <file> --regulation sox           # SOX
akf audit <file> --regulation nist_ai       # NIST AI RMF
```

## 分类

- `--label confidential` for finance/secret/internal paths
- `--label public` for README, docs, examples
- Default: `internal`

## 安装

```bash
pip install akf
```

## 链接

- https://akf.dev
- https://github.com/HMAKT99/AKF
- npm: `npm install akf-format`

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
