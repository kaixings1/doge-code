---
name: seo-sitemap
description: "Seo Sitemap — 分析现有 XML 站点地图或生成新站点地图相关功能和最佳实践。"
  Validates format, URLs, and structure. Use when user says "sitemap",
  "generate sitemap", "sitemap issues", or "XML sitemap".
user-invocable: true
argument-hint: "[url or generate]"
license: MIT
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# Sitemap Analysis & Generation

## Mode 1: Analyze Existing Sitemap

### Validation Checks
- Valid XML format
- URL count <50,000 per file (protocol limit)
- All URLs return HTTP 200
- `<lastmod>` dates are accurate (not all identical)
- No deprecated tags: `<priority>` and `<changefreq>` are ignored by Google
- Sitemap referenced in robots.txt
- Compare crawled pages vs sitemap; flag missing pages

### Quality Signals
- Sitemap index file if >50k URLs
- Split by content type (pages, posts, images, videos)
- No non-canonical URLs in sitemap
- No noindexed URLs in sitemap
- No redirected URLs in sitemap
- HTTPS URLs only (no HTTP)

### Common Issues
| Issue | Severity | Fix |