---
name: seo
description: "任何网站或业务类型的全面 SEO 分析。完整网站审计、单页分析、技术 SEO（可爬取性、可索引性、Core Web Vitals with INP）、schema 标记、内容质量 (E-E-A-T)、图片优化、网站地图分析和面向 AI Overviews/ChatGPT/Perplexity 的 GEO。支持 SaaS、电商、本地服务、发布商、机构的行业检测。"
user-invocable: true
argument-hint: "[command] [url]"
license: MIT
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# SEO：通用 SEO 分析技能

**调用：** `/seo $1 $2`，其中 `$1` 是命令，`$2` 是 URL 或参数。

**脚本：** 位于插件根目录的 `scripts/` 目录。

涵盖所有行业（SaaS、本地服务、电商、发布商、机构）的全面 SEO 分析。编排 24 个子技能（21 个核心 + 1 个框架集成 + 2 个扩展镜像）和 18 个子代理。另可安装可选的 Firecrawl 扩展（见下方"可选扩展"）。

## 快速参考

| 命令 | 功能 |