---
name: 语音合成相关功能和最佳实践
description: "Speech — 语音合成相关功能和最佳实践"
  使用 OpenAI API 的内置语音从文本生成语音音频。适用于解说视频、讲座音频和快速配音。
triggers:
  - "openai speech"
  - "tts openai"
  - "narrated audio"
  - "voice over"
od:
  mode: audio
  category: audio-music
  upstream: "https://github.com/openai/skills"
---

# 语音

> Curated from OpenAI's skills repository.

## 功能说明

Generate spoken audio from text using OpenAI's API with built-in voices. Useful for narrated explainers, lecture audio, and quick voiceover tracks.

## 来源

- Upstream: https://github.com/openai/skills
- Category: `audio-music`

## 使用方法

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream 工作流 with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/openai/skills
```

Then ask the agent to invoke this skill by name (`speech`) or with
one of the trigger phrases listed in this skill's frontmatter.
