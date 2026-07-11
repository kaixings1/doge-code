---
name: Firecrawl搜索技能
description: Firecrawl搜索技能
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl search

带有可选内容抓取的网页搜索。返回JSON格式的搜索结果，可选包含完整页面内容。

## 何时使用

- 你还没有具体的URL
- 你需要查找页面、回答问题或发现来源
- [工作流升级模式](firecrawl-cli)中的第一步：search → scrape → map → crawl → interact

## 快速开始

```bash
# Basic search
firecrawl search "your 查询" -o .firecrawl/result.json --json

# Search and scrape full page content from results
firecrawl search "your 查询" --scrape -o .firecrawl/scraped.json --json

# News from the past day
firecrawl search "your 查询" --sources news --tbs qdr:d -o .firecrawl/news.json --json
```

## 选项

| Option                               | Description                                   |
| ------------------------------------ | --------------------------------------------- |
| `--limit <n>`                        | Max number of results                         |
| `--sources <web,images,news>`        | Source types to search                        |
| `--categories <github,research,pdf>` | 过滤器 by category                            |
| `--tbs <qdr:h\|d\|w\|m\|y>`          | Time-based search 过滤器                      |
| `--location`                         | Location for search results                   |
| `--country <code>`                   | Country code for search                       |
| `--scrape`                           | Also scrape full page content for each result |
| `--scrape-formats`                   | Formats when scraping (default: markdown)     |
| `-o, --output <path>`                | Output file path                              |
| `--json`                             | Output as JSON                                |

## 提示

- **`--scrape` fetches full content** — don't re-scrape URLs from search results. This saves credits and avoids redundant fetches.
- 始终 write results to `.firecrawl/` with `-o` to avoid context window bloat.
- Use `jq` to extract URLs or titles: `jq -r '.data.web[].url' .firecrawl/search.json`
- Naming convention: `.firecrawl/search-{查询}.json` or `.firecrawl/search-{查询}-scraped.json`

## 参见

- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — scrape a specific URL
- [firecrawl-map](../firecrawl-map/SKILL.md) — discover URLs within a site
- [firecrawl-crawl](../firecrawl-crawl/SKILL.md) — bulk extract from a site
