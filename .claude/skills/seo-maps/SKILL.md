---
name: seo-maps
description: "Seo Maps — 本地 SEO 地图智能分析相关功能和最佳实践：地理网格排名跟踪、GBP 画像审计、跨平台评论情报和 NAP 验证。"
  auditing via API, review intelligence across Google/Tripadvisor/Trustpilot,
  cross-platform NAP verification (Google/Bing/Apple/OSM), competitor
  radius mapping, and LocalBusiness 架构 generation from API data.
  Three-tier capability: free (Overpass + Geoapify), DataForSEO (full
  intelligence), DataForSEO + Google (maximum coverage). Use when user
  says "maps", "geo-grid", "rank tracking", "GBP audit", "review
  velocity", "competitor radius", "maps analysis", "local rank
  tracking", "Share of Local Voice", or "SoLV".
user-invocable: true
参数-hint: "[command] [url|keyword|location]"
license: MIT
compatibility: "DataForSEO MCP for Tier 1+, Google Maps API for Tier 2"
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# Maps Intelligence (March 2026)

Maps platform analysis for local businesses. Works with external APIs to assess
how a business appears on Google Maps, Bing Places, Apple Maps, and OpenStreetMap.

**Boundary with seo-local:** This skill analyzes the business on maps PLATFORMS
(via APIs). seo-local analyzes local SEO signals on the WEBSITE (via HTML fetch).
Do not duplicate seo-local on-page analysis. Recommend `/seo local <url>` for
website-level checks.

