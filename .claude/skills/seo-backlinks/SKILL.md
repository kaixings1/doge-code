---
name: seo-backlinks
description: "反向链接画像分析：引用域名、锚文本分布、毒性链接检测、竞争对手差距分析。使用免费 API（Moz、Bing Webmaster、Common Crawl）和 DataForSEO 扩展。当用户提到反向链接、链接画像、引用域名、锚文本、毒性链接、链接差距、链接建设、拒绝或反向链接审计时使用。"
user-invocable: true
argument-hint: "<url>"
license: MIT
compatibility: "Free: Common Crawl + verify always available. Optional: Moz API, Bing Webmaster (free signup). Premium: DataForSEO extension."
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# Backlink Profile Analysis

## Source Detection

Before analysis, detect available data sources:

1. **DataForSEO MCP** (premium): Check if `dataforseo_backlinks_summary` tool is available
2. **Moz API** (free signup): `python3 scripts/backlinks_auth.py --check moz --json`
3. **Bing Webmaster** (free signup): `python3 scripts/backlinks_auth.py --check bing --json`
4. **Common Crawl** (always available): Domain-level graph with PageRank
5. **Verification Crawler** (always available): Checks if known backlinks still exist

Run `python3 scripts/backlinks_auth.py --check --json` to detect all sources at once.

If no sources are configured beyond the always-available tier:
- Still produce a report using Common Crawl domain metrics
- Suggest: "Run `/seo backlinks setup` to add free Moz and Bing API keys for richer data"

## Quick Reference

| Command | Purpose |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 01 MINUTES 54 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE