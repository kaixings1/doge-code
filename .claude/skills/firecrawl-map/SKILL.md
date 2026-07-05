---
name: firecrawl-map
description: Firecrawl站点映射技能
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl map

发现站点上的URL。使用 `--search` 在大型站点中查找特定页面。

## 何时使用

- 你需要在大型站点上查找特定的子页面
- 在抓取或爬取之前，你想要站点上所有URL的列表
- [工作流升级模式](firecrawl-cli)中的第3步：search → scrape → **map** → crawl → interact

## Quick start

```bash
# Find a specific page on a large site
firecrawl map "<url>" --search "authentication" -o .firecrawl/filtered.txt

# Get all URLs
firecrawl map "<url>" --limit 500 --json -o .firecrawl/urls.json
```

## Options

| Option                            | Description                  |
| --------------------------------- | ---------------------------- |
| `--limit <n>`                     | Max number of URLs to return |
| `--search <query>`                | Filter URLs by search query  |
| `--sitemap <include\|skip\|only>` | Sitemap handling strategy    |
| `--include-subdomains`            | Include subdomain URLs       |
| `--json`                          | Output as JSON               |
| `-o, --output <path>`             | Output file path             |

## 提示

- **Map + scrape is a common pattern**: use `map --search` to find the right URL, then `scrape` it.
- Example: `map https://docs.example.com --search "auth"` → found `/docs/api/authentication` → `scrape` that URL.

## See also

- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — scrape the URLs you discover
- [firecrawl-crawl](../firecrawl-crawl/SKILL.md) — bulk extract instead of map + scrape
- [firecrawl-download](../firecrawl-download/SKILL.md) — download entire site (uses map internally)
