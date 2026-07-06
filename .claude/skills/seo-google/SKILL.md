---
name: seo-google
description: "Seo Google — Google SEO API 相关功能和最佳实践：Search Console、PageSpeed Insights、CrUX、Indexing API 和 GA4 自然流量数据。"
  PageSpeed Insights v5, CrUX field data with 25-week history, Indexing API v3,
  and GA4 organic traffic. Provides real Google field data for Core Web Vitals,
  indexation status, search performance, and organic traffic trends. Use when
  user says "search console", "GSC", "PageSpeed", "CrUX", "field data",
  "indexing API", "GA4 organic", "URL inspection", "google api 设置",
  "real CWV data", "impressions", "clicks", "CTR", "position data",
  "LCP", "INP", "CLS", "FCP", "TTFB", or "Lighthouse scores".
user-invocable: true
参数-hint: "[command] [url|property]"
license: MIT
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# Google SEO APIs

Direct access to Google's own SEO data. Bridges the gap between crawl-based
analysis (existing claude-seo skills) and Google's real-time field data: actual
Chrome user metrics, real indexation status, search performance, and organic traffic.

All APIs are free. 设置 requires a Google Cloud project with API key and/or
service account -- run `/seo google 设置` for step-by-step instructions.

## 前提条件

Before executing any command, check credentials:
```bash
python3 scripts/google_auth.py --check --json
```

Config file: `~/.config/claude-seo/google-api.json`
```json
{
  "service_account_path": "/path/to/service_account.json",
  "api_key": "<GOOGLE_API_KEY>",
  "default_property": "sc-domain:example.com",
  "ga4_property_id": "properties/123456789"
}
```

If missing, read `references/auth-设置.md` and walk the user through 设置.

### Credential Tiers

| Tier | Detection | Available Commands |