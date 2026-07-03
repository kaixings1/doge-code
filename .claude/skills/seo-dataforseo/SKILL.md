---
name: seo-dataforseo
description: "Seo Dataforseo — Seo Dataforseo 相关功能和最佳实践"
  Live SEO data via DataForSEO MCP server. SERP analysis (Google, Bing, Yahoo,
  YouTube, Google Images), keyword research (volume, difficulty, intent, trends),
  backlink profiles, on-page analysis (Lighthouse, content parsing), competitor
  analysis, content analysis, business listings, AI visibility (ChatGPT scraper,
  LLM mention tracking), and domain analytics. Requires DataForSEO extension
  installed. Use when user says "dataforseo", "live SERP", "keyword volume",
  "backlink data", "competitor data", "AI visibility check", "LLM mentions",
  "image SERP", "google images", "image rankings", or "real search data".
user-invocable: true
argument-hint: "[command] [query]"
license: MIT
compatibility: "Requires DataForSEO MCP server"
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# DataForSEO: Live SEO Data (Extension)

Live search data via the DataForSEO MCP server. Provides real-time SERP results
(organic + images), keyword metrics, backlink profiles, on-page analysis, content
analysis, business listings, AI visibility checking, and LLM mention tracking
across 10 API modules with 79+ MCP tools.

## Prerequisites

This skill requires the DataForSEO extension to be installed:
```bash
./extensions/dataforseo/install.sh
```

**Check availability:** Before using any DataForSEO tool, verify the MCP server
is connected by checking if `serp_organic_live_advanced` or any DataForSEO tool
is available. If tools are not available, inform the user the extension is not
installed and provide install instructions.

## API Credit Awareness

DataForSEO charges per API call. Be efficient:
- Prefer bulk endpoints over multiple single calls
- Use default parameters (US, English) unless user specifies otherwise
- Cache results mentally within a session; don't re-fetch the same data
- Warn user before running expensive operations (full backlink crawls, large keyword lists)

## Cost Guardrails

**Before every DataForSEO MCP call**, run cost estimation:
```
python3 scripts/dataforseo_costs.py check <endpoint> [--count N]
```

- If `"status": "approved"` → proceed with the API call
- If `"status": "needs_approval"` → show the cost estimate to the user and ask for confirmation before proceeding
- If `"status": "blocked"` → inform the user that the daily budget limit would be exceeded; do NOT proceed

**After each API call completes**, log the cost:
```
python3 scripts/dataforseo_costs.py log <endpoint> <actual_cost>
```

**User commands for cost management:**
- `/seo dataforseo costs today` → show today's spending breakdown
- `/seo dataforseo costs summary` → show 7-day spending history
- `/seo dataforseo costs config --mode threshold --threshold 0.50` → configure approval mode

Load `references/cost-tiers.md` for the full pricing table, budget presets, and cost reduction tips.

## Quick Reference

| Command | What it does |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 01 MINUTES 48 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE