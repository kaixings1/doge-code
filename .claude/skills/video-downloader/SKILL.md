---
name: 视频下载器
description: "视频下载器 — 从 YouTube 和其他平台下载视频以供离线观看、编辑或存档，支持多种格式和质量选项。"
triggers:
  - "download video"
  - "youtube download"
  - "archive video"
  - "offline video"
od:
  mode: video
  category: video-generation
  upstream: "https://github.com/ComposioHQ/awesome-claude-skills/tree/master/video-downloader"
---

# video-downloader

> Curated from ComposioHQ awesome-claude-skills.

## 功能说明

Download videos from YouTube and other platforms for offline viewing, editing, or archival with support for various formats and quality options.

## 来源

- Upstream: https://github.com/ComposioHQ/awesome-claude-skills/tree/master/video-downloader
- Category: `video-generation`

## 使用方法

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream 工作流 with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/ComposioHQ/awesome-claude-skills/tree/master/video-downloader
```

Then ask the agent to invoke this skill by name (`video-downloader`) or with
one of the trigger phrases listed in this skill's frontmatter.
