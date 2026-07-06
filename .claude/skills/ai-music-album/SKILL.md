---
name: ai-music-album
description: "AI 音乐专辑 — 全生命周期 AI 音乐专辑制作 — 概念、歌词草稿、曲目排序和导出的完整流程。适用于独立专辑实验和品牌配乐。"
triggers:
  - "ai music"
  - "music album"
  - "lyric writing"
  - "track sequencing"
  - "album production"
od:
  mode: audio
  category: audio-music
  upstream: "https://github.com/bitwize-music-studio/claude-ai-music-skills"
---

# ai-music-album

> Curated from bitwize-music-studio.

## What it does

Full-lifecycle AI music album production — concept, lyric drafting, track sequencing, and export. Useful for indie album experiments and brand soundtracks.

## Source

- Upstream: https://github.com/bitwize-music-studio/claude-ai-music-skills
- Category: `audio-music`

## 使用方法

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream 工作流 with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/bitwize-music-studio/claude-ai-music-skills
```

Then ask the agent to invoke this skill by name (`ai-music-album`) or with
one of the trigger phrases listed in this skill's frontmatter.
