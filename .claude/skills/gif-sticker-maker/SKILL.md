---
name: gif-sticker-maker
description: "Gif Sticker Maker — Gif Sticker Maker 相关功能和最佳实践"
  通过 MiniMax API 将照片转换为 Funko Pop / Pop Mart 风格的动画 GIF 贴纸。适用于个性化聊天贴纸和头像包。
triggers:
  - "gif sticker"
  - "funko sticker"
  - "animated sticker"
  - "pop mart"
  - "表情包"
od:
  mode: image
  category: image-generation
  upstream: "https://github.com/MiniMax-AI/skills"
---

# GIF 贴纸制作器

> Curated from MiniMax AI team.

## 功能

通过 MiniMax API 将照片转换为 Funko Pop / Pop Mart 风格的动画 GIF 贴纸。适用于个性化聊天贴纸和头像包。

## 来源

- Upstream: https://github.com/MiniMax-AI/skills
- Category: `image-generation`

## 使用方法

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/MiniMax-AI/skills
```

Then ask the agent to invoke this skill by name (`gif-sticker-maker`) or with
one of the trigger phrases listed in this skill's frontmatter.
