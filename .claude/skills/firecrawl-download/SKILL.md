---
name: Firecrawl下载技能
description: Firecrawl下载技能
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl download

> **实验性功能。** 便捷命令，结合 `map` + `scrape` 将整个站点保存为本地文件。

先映射站点以发现页面，然后将每个页面抓取到 `.firecrawl/` 下的嵌套目录中。所有抓取选项都适用于 download。始终传递 `-y` 以跳过确认提示。

## 何时使用

- 你想要将整个站点（或部分）保存到本地文件
- 你需要离线访问文档或内容
- 需要以组织化的文件结构进行批量内容提取

## 快速入门

```bash
# Interactive wizard (picks format, screenshots, paths for you)
firecrawl download https://docs.example.com

# With screenshots
firecrawl download https://docs.example.com --screenshot --limit 20 -y

# Multiple formats (each saved as its own file per page)
firecrawl download https://docs.example.com --format markdown,links --screenshot --limit 20 -y
# Creates per page: index.md + links.txt + screenshot.png

# 过滤器 to specific sections
firecrawl download https://docs.example.com --include-paths "/features,/sdks"

# Skip translations
firecrawl download https://docs.example.com --exclude-paths "/zh,/ja,/fr,/es,/pt-BR"

# Full combo
firecrawl download https://docs.example.com \
  --include-paths "/features,/sdks" \
  --exclude-paths "/zh,/ja" \
  --only-main-content \
  --screenshot \
  -y
```

## Download options

| Option                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `--limit <n>`             | Max pages to download                                    |
| `--search <查询>`        | 过滤器 URLs by search 查询                              |
| `--include-paths <paths>` | Only download matching paths                             |
| `--exclude-paths <paths>` | Skip matching paths                                      |
| `--allow-subdomains`      | Include subdomain pages                                  |
| `-y`                      | Skip confirmation prompt (always use in automated flows) |

## Scrape options (all work with download)

`-f <formats>`, `-H`, `-S`, `--screenshot`, `--full-page-screenshot`, `--only-main-content`, `--include-tags`, `--exclude-tags`, `--wait-for`, `--max-age`, `--country`, `--languages`

## 参见

- [firecrawl-map](../firecrawl-map/SKILL.md) — just discover URLs without downloading
- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — scrape individual pages
- [firecrawl-crawl](../firecrawl-crawl/SKILL.md) — bulk extract as JSON (not local files)
