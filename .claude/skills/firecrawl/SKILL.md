---
name: firecrawl
description:  |
  通过 Firecrawl CLI 进行网页抓取、搜索、爬取和页面交互。当用户需要搜索网页、查找文章、研究主题、在线查询、抓取网页、从 URL 获取内容、从网站提取数据、爬取文档、下载站点或与需要点击/登录的页面交互时使用。也适用于"获取这个页面"、"拉取内容"、"拿到这个 URL 的内容"等场景。提供实时网页搜索和完整页面内容提取能力。不适用于本地文件操作、git 命令、部署或代码编辑任务。
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# Firecrawl CLI

网页抓取、搜索和页面交互命令行工具。输出针对 LLM 上下文窗口优化的干净 Markdown 格式。

运行 `firecrawl --help` 或 `firecrawl <command> --help` 查看完整选项。

## 前置要求

必须安装并认证。用 `firecrawl --status` 检查状态。

```
  🔥 firecrawl cli v1.8.0

  ● Authenticated via FIRECRAWL_API_KEY
  Concurrency: 0/100 jobs (parallel scrape limit)
  Credits: 500,000 remaining
```

- **Concurrency（并发）**：最大并行任务数，在此限制内并行运行。
- **Credits（额度）**：剩余 API 额度，每次抓取/爬取都会消耗。

如果未就绪，请查看 [rules/install.md](rules/install.md)。输出处理指南见 [rules/security.md](rules/security.md)。

```bash
firecrawl search "query" --scrape --limit 3
```

## 工作流程

按照以下升级模式操作：

1. **Search（搜索）** - 还没有具体 URL。查找页面、回答问题、发现来源。
2. **Scrape（抓取）** - 有具体的 URL。直接提取内容。
3. **Map + Scrape（映射+抓取）** - 大型站点或需要特定子页面。先用 `map --search` 找到正确的 URL，再抓取。
4. **Crawl（爬取）** - 需要一个完整站点部分的大量内容（例如所有 /docs/）。
5. **Interact（交互）** - 先抓取，再与页面交互（分页、弹窗、表单提交、多步骤导航）。

| 需求                           | 命令                  | 适用场景                                  |
| ----------------------------- | --------------------- | ----------------------------------------- |
| 查找某个主题的页面             | `search`              | 还没有具体的 URL                          |
| 获取页面内容                   | `scrape`              | 有 URL，页面是静态或 JS 渲染              |
| 查找站点内的 URL              | `map`                 | 需要定位特定子页面                        |
| 批量提取站点部分               | `crawl`               | 需要很多页面（例如所有 /docs/）           |
| AI 驱动数据提取               | `agent`               | 需要从复杂站点提取结构化数据              |
| 与页面交互                     | `scrape` + `interact` | 内容需要点击、填表、分页或登录           |
| 将站点下载到本地文件           | `download`            | 将整个站点保存为本地文件                  |

详细命令参考：`firecrawl <command> --help`。

**Scrape vs Interact：**

- 优先使用 `scrape`，它可以处理静态页面和 JS 渲染的 SPA。
- 需要交互时才用 `scrape` + `interact`，如点击按钮、填写表单、复杂站点导航、无限滚动，或 scrape 无法获取所需内容时。
- 绝不要用 interact 做网页搜索——用 `search` 代替。

**避免重复获取：**

- `search --scrape` 已经获取了完整页面内容，不要重复抓取这些 URL。
- 再次抓取前先检查 `.firecrawl/` 是否存在已有数据。

## 输出与组织

除非用户指定返回在上下文中，否则用 `-o` 将结果写入 `.firecrawl/` 目录。将 `.firecrawl/` 加入 `.gitignore`。始终用引号包裹 URL——shell 会将 `?` 和 `&` 解释为特殊字符。

```bash
firecrawl search "react hooks" -o .firecrawl/search-react-hooks.json --json
firecrawl scrape "<url>" -o .firecrawl/page.md
```

命名规范：

```
.firecrawl/search-{query}.json
.firecrawl/search-{query}-scraped.json
.firecrawl/{site}-{path}.md
```

绝不要一次性读取整个输出文件。使用 `grep`、`head` 或增量读取：

```bash
wc -l .firecrawl/file.md && head -50 .firecrawl/file.md
grep -n "keyword" .firecrawl/file.md
```

单一格式输出原始内容。多种格式（如 `--format markdown,links`）输出 JSON。

## 处理结果

处理基于文件的输出（`-o` 标志）时的常用模式：

```bash
# 从搜索中提取 URL
jq -r '.data.web[].url' .firecrawl/search.json

# 获取标题和 URL
jq -r '.data.web[] | "\(.title): \(.url)"' .firecrawl/search.json
```

## 并行化

并行运行独立操作。用 `firecrawl --status` 检查并发限制：

```bash
firecrawl scrape "<url-1>" -o .firecrawl/1.md &
firecrawl scrape "<url-2>" -o .firecrawl/2.md &
firecrawl scrape "<url-3>" -o .firecrawl/3.md &
wait
```

对于交互操作，先抓取多个页面，然后用各自的抓取 ID 独立交互。

## 额度使用

```bash
firecrawl credit-usage
firecrawl credit-usage --json --pretty -o .firecrawl/credits.json
```
