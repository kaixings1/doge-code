---
name: seo-image-gen
description: "用于 SEO 资产的 AI 图像生成：OG/社交预览图、博客主图、schema 图像、产品摄影、信息图。由 Gemini 通过 nanobanana-mcp 驱动。需要安装 banana 扩展。"
argument-hint: "[og|hero|product|infographic|custom|batch] <description>"
user-invocable: true
license: MIT
compatibility: "需要 nanobanana MCP server"
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# SEO Image Gen：SEO 资产的 AI 图像生成（扩展）

使用 Gemini 的图像生成通过 banana Creative Director 管道为 SEO 用例生成生产就绪的图像。将 SEO 需求映射到优化的域模式、宽高比和分辨率默认值。

## 架构 Note

This extension is built on [Claude Banana](https://github.com/AgriciDaniel/banana-claude),
the standalone AI image generation skill for Claude Code.

This skill has two components with distinct roles:
- **SKILL.md** (this file): Handles interactive `/seo image-gen` commands for generating images
- **Agent** (`agents/seo-image-gen.md`): Audit-only analyst spawned during `/seo audit` to assess existing OG/social images and produce a generation plan (never auto-generates)

## 前提条件

This skill requires the banana extension to be installed:
```bash
./extensions/banana/install.sh
```

**Check availability:** Before using any image generation tool, verify the MCP server
is connected by checking if `gemini_generate_image` or `set_aspect_ratio` tools are
available. If tools are not available, inform the user the extension is not installed
and provide install instructions.

## 快速参考

| Command | What it does |