---
name: youtube-clipper
description: |
  基于自动化工作流生成和剪辑 YouTube 视频片段：拉取源视频、选取高光片段、添加字幕并导出。
triggers:
  - "youtube clip"
  - "video clip"
  - "highlight reel"
  - "auto caption clip"
od:
  mode: video
  category: video-generation
  upstream: "https://github.com/op7418/Youtube-clipper-skill"
---

# youtube-clipper

> Curated from @op7418.

## What it does

YouTube clip generation and editing with automated workflows — pull source video, slice highlights, add captions, and export.

## Source

- Upstream: https://github.com/op7418/Youtube-clipper-skill
- Category: `video-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/op7418/Youtube-clipper-skill
```

Then ask the agent to invoke this skill by name (`youtube-clipper`) or with
one of the trigger phrases listed in this skill's frontmatter.
