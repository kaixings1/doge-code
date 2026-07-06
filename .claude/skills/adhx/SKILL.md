---
name: adhx
description: "将任何 X/Twitter 帖子获取为干净的 LLM 友好 JSON。将 x.com、twitter.com 或 adhx.com 链接转换为结构化数据，包含完整文章内容、作者信息和互动指标。无需爬虫或浏览器。"
risk: safe
source: community
date_added: "2026-03-25"
---

# ADHX - X/Twitter 帖子阅读器

使用 ADHX API 获取任何 X/Twitter 帖子作为结构化 JSON 进行分析。

## 概述

ADHX 提供一个免费 API，为任何 X 帖子返回干净的 JSON，包括完整的长篇文章内容。这比用于 LLM 消费的爬虫或基于浏览器的方法优越得多。适用于常规推文和完整的 X 文章。

## 何时使用此技能

- 当用户分享 X/Twitter 链接并希望阅读、分析或总结帖子时使用
- 当您需要来自 X/Twitter 帖子的结构化数据（作者、互动、内容）时使用
- 当处理需要完整内容提取的长篇 X 文章时使用

## API 端点

```
https://adhx.com/api/share/tweet/{username}/{statusId}
```

## URL Patterns

Extract `username` and `statusId` from any of these URL formats:

| Format | Example |