---
name: adhx
description: "将任何 X/Twitter 帖子获取为干净的 LLM 友好 JSON。将 x.com、twitter.com 或 adhx.com 链接转换为结构化数据，包含完整文章内容、作者信息和互动指标。无需爬虫或浏览器。"
risk: safe
source: community
date_added: "2026-03-25"
---

# ADHX - X/Twitter Post Reader

Fetch any X/Twitter post as structured JSON for analysis using the ADHX API.

## 概述

ADHX provides a free API that returns clean JSON for any X post, including full long-form article content. This is far superior to scraping or browser-based approaches for LLM consumption. Works with regular tweets and full X Articles.

## When to Use This Skill

- Use when a user shares an X/Twitter link and wants to read, analyze, or summarize the post
- Use when you need structured data from an X/Twitter post (author, engagement, content)
- Use when working with long-form X Articles that need full content extraction

## API Endpoint

```
https://adhx.com/api/share/tweet/{username}/{statusId}
```

## URL Patterns

Extract `username` and `statusId` from any of these URL formats:

| Format | Example |