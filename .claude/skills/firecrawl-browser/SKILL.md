---
name: firecrawl-browser
description: Firecrawl浏览器自动化
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl interact（原 browser）

> **`browser` 命令已弃用。** 请使用 `scrape` + `interact` 替代。Interact 允许你抓取页面，然后点击、填写表单和导航，无需手动管理会话。

在实时浏览器会话中与抓取的页面进行交互。先抓取页面，然后使用自然语言提示或代码进行点击、填写表单、导航和提取数据。

## 何时使用

- 内容需要交互：点击、表单填写、分页、登录
- `scrape` 失败，因为内容在 JavaScript 交互之后
- 你需要导航多步骤流程
- [工作流升级模式](firecrawl-cli)中的最后手段：search → scrape → map → crawl → **interact**
- **绝不 use interact for web searches** — use `search` instead

## Quick start

```bash
# 1. Scrape a page (scrape ID is saved automatically)
firecrawl scrape "<url>"

# 2. Interact with the page using natural language
firecrawl interact --prompt "Click the login button"
firecrawl interact --prompt "Fill in the email field with test@example.com"
firecrawl interact --prompt "Extract the pricing table"

# 3. Or use code for precise control
firecrawl interact --code "agent-browser click @e5" --language bash
firecrawl interact --code "agent-browser snapshot -i" --language bash

# 4. Stop the session when done
firecrawl interact stop
```

## Options

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `--prompt <text>`     | Natural language instruction (use this OR --code) |
| `--code <code>`       | Code to execute in the browser session            |
| `--language <lang>`   | Language for code: bash, python, node             |
| `--timeout <seconds>` | Execution timeout (default: 30, max: 300)         |
| `--scrape-id <id>`    | Target a specific scrape (default: last scrape)   |
| `-o, --output <path>` | Output file path                                  |

## Profiles

Use `--profile` on the scrape to persist browser state (cookies, localStorage) across scrapes:

```bash
# Session 1: Login and save state
firecrawl scrape "https://app.example.com/login" --profile my-app
firecrawl interact --prompt "Fill in email with user@example.com and click login"

# Session 2: Come back authenticated
firecrawl scrape "https://app.example.com/dashboard" --profile my-app
firecrawl interact --prompt "Extract the dashboard data"
```

Read-only reconnect (no writes to profile state):

```bash
firecrawl scrape "https://app.example.com" --profile my-app --no-save-changes
```

## 提示

- 始终 scrape first — `interact` requires a scrape ID from a previous `firecrawl scrape` call
- The scrape ID is saved automatically, so you don't need `--scrape-id` for subsequent interact calls
- Use `firecrawl interact stop` to free resources when done
- For parallel work, scrape multiple pages and interact with each using `--scrape-id`

## See also

- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — try scrape first, escalate to interact only when needed
- [firecrawl-search](../firecrawl-search/SKILL.md) — for web searches (never use interact for searching)
- [firecrawl-agent](../firecrawl-agent/SKILL.md) — AI-powered extraction (less manual control)
