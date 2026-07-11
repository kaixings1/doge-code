---
name: Firecrawl爬取技能
description: Firecrawl爬取技能
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl crawl

从网站批量提取内容。爬取页面，按照链接深入到指定深度/限制。

## 何时使用

- 你需要从网站的多个页面获取内容（例如所有 `/docs/`）
- 你想要提取整个网站部分
- [工作流升级模式](firecrawl-cli)中的第4步：search → scrape → map → **crawl** → interact

## 快速开始

```bash
# 爬取文档部分
firecrawl crawl "<url>" --include-paths /docs --limit 50 --wait -o .firecrawl/crawl.json

# 带深度限制的完整爬取
firecrawl crawl "<url>" --max-depth 3 --wait --progress -o .firecrawl/crawl.json

# Check status of a running crawl
firecrawl crawl <job-id>
```

## 选项

| Option                    | Description                                 |
| ------------------------- | ------------------------------------------- |
| `--wait`                  | Wait for crawl to complete before returning |
| `--progress`              | Show progress while waiting                 |
| `--limit <n>`             | Max pages to crawl                          |
| `--max-depth <n>`         | Max link depth to follow                    |
| `--include-paths <paths>` | Only crawl URLs matching these paths        |
| `--exclude-paths <paths>` | Skip URLs matching these paths              |
| `--delay <ms>`            | Delay between requests                      |
| `--max-concurrency <n>`   | Max parallel crawl workers                  |
| `--pretty`                | Pretty print JSON output                    |
| `-o, --output <path>`     | Output file path                            |

## 提示

- Always use `--wait` when you need the results immediately. Without it, crawl returns a job ID for async polling.
- Use `--include-paths` to scope the crawl — don't crawl an entire site when you only need one section.
- Crawl consumes credits per page. Check `firecrawl credit-usage` before large crawls.

## 参见

- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — scrape individual pages
- [firecrawl-map](../firecrawl-map/SKILL.md) — discover URLs before deciding to crawl
- [firecrawl-download](../firecrawl-download/SKILL.md) — download site to local files (uses map + scrape)
