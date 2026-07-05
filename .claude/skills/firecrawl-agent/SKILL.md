---
name: firecrawl-agent
description: Firecrawl AI代理模式
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl agent

AI驱动的自主提取。代理导航站点并提取结构化数据（需要2-5分钟）。

## 何时使用

- 你需要从复杂的多页面站点获取结构化数据
- 手动抓取需要导航多个页面
- 你希望AI找出数据所在位置

## 快速开始

```bash
# 提取结构化数据
firecrawl agent "extract all pricing tiers" --wait -o .firecrawl/pricing.json

# 使用JSON模式进行结构化输出
firecrawl agent "extract products" --schema '{"type":"object","properties":{"name":{"type":"string"},"price":{"type":"number"}}}' --wait -o .firecrawl/products.json

# 专注于特定页面
firecrawl agent "get feature list" --urls "<url>" --wait -o .firecrawl/features.json
```

## Options

| Option                 | Description                               |
| ---------------------- | ----------------------------------------- |
| `--urls <urls>`        | Starting URLs for the agent               |
| `--model <model>`      | Model to use: spark-1-mini or spark-1-pro |
| `--schema <json>`      | JSON schema for structured output         |
| `--schema-file <path>` | Path to JSON schema file                  |
| `--max-credits <n>`    | Credit limit for this agent run           |
| `--wait`               | Wait for agent to complete                |
| `--pretty`             | Pretty print JSON output                  |
| `-o, --output <path>`  | Output file path                          |

## 提示

- 始终 use `--wait` to get results inline. Without it, returns a job ID.
- Use `--schema` for predictable, structured output — otherwise the agent returns freeform data.
- Agent runs consume more credits than simple scrapes. Use `--max-credits` to cap spending.
- For simple single-page extraction, prefer `scrape` — it's faster and cheaper.

## See also

- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — simpler single-page extraction
- [firecrawl-browser](../firecrawl-browser/SKILL.md) — scrape + interact for manual page interaction (more control)
- [firecrawl-crawl](../firecrawl-crawl/SKILL.md) — bulk extraction without AI
