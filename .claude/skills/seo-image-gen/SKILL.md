---
name: seo-image-gen
description: "用于 SEO 资产的 AI 图像生成：OG/社交预览图、博客主图、schema 图像、产品摄影、信息图。由 Gemini 通过 nanobanana-mcp 驱动。需要安装 banana 扩展。"
argument-hint: "[og|hero|product|infographic|custom|batch] <description>"
user-invocable: true
license: MIT
compatibility: "Requires nanobanana MCP server"
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# SEO Image Gen: AI Image Generation for SEO Assets (Extension)

Generate production-ready images for SEO use cases using Gemini's image generation
via the banana Creative Director pipeline. Maps SEO needs to optimized domain modes,
aspect ratios, and resolution defaults.

## Architecture Note

This extension is built on [Claude Banana](https://github.com/AgriciDaniel/banana-claude),
the standalone AI image generation skill for Claude Code.

This skill has two components with distinct roles:
- **SKILL.md** (this file): Handles interactive `/seo image-gen` commands for generating images
- **Agent** (`agents/seo-image-gen.md`): Audit-only analyst spawned during `/seo audit` to assess existing OG/social images and produce a generation plan (never auto-generates)

## Prerequisites

This skill requires the banana extension to be installed:
```bash
./extensions/banana/install.sh
```

**Check availability:** Before using any image generation tool, verify the MCP server
is connected by checking if `gemini_generate_image` or `set_aspect_ratio` tools are
available. If tools are not available, inform the user the extension is not installed
and provide install instructions.

## Quick Reference

| Command | What it does |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 01 MINUTES 40 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE