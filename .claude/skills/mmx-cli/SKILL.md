---
name: mmx-cli
description: "使用 mmx 通过 MiniMax AI 平台生成文本、图像、视频、语音和音乐。当用户想要创建媒体内容、与 MiniMax 模型聊天、执行网络搜索或从终端管理 MiniMax API 资源时使用。"
risk: safe
source: "https://github.com/MiniMax-AI/cli"
date_added: "2026-04-14"
---

# MiniMax CLI — Agent Skill Guide

Use `mmx` to generate text, images, video, speech, music, and perform web search via the MiniMax AI platform.

## 使用场景

使用此技能当 the user wants to generate or inspect text, images, video, speech, music, web-search results, or MiniMax API resources through the `mmx` terminal CLI.

## 前提条件

```bash
# Install
npm install -g mmx-cli

# Auth (OAuth persists to ~/.mmx/credentials.json, API key persists to ~/.mmx/config.json)
mmx auth login --api-key sk-xxxxx

# Verify active auth source
mmx auth status

# Or pass per-call
mmx text chat --api-key sk-xxxxx --message "Hello"
```

Region is auto-detected. Override with `--region global` or `--region cn`.
