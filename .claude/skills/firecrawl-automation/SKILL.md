---
name: firecrawl-自动化
description: "自动化 Firecrawl 网络爬取和数据提取——爬取页面、爬取网站、提取结构化数据、批量爬取 URL、映射网站结构。始终先调用 RUBE_SEARCH_TOOLS 获取最新工具 schema。"
requires:
  mcp:
    - rube
---

# Firecrawl 自动化

直接从 Claude Code 运行 **Firecrawl** 网页爬取和数据提取。在不离开终端的情况下，抓取单个页面、爬取整个网站、使用AI提取结构化数据、批量处理URL列表以及映射网站结构。

**工具包文档：** [composio.dev/toolkits/firecrawl](https://composio.dev/toolkits/firecrawl)

---

## 设置

1. 将 Composio MCP 服务器添加到你的配置中：
   ```
   https://rube.app/mcp
   ```
2. 在提示时连接你的 Firecrawl 账户。代理将提供一个认证链接。
3. 注意信用消耗 -- 严格限定爬取范围，并在扩展前在小的URL集合上测试。

---

## 核心工作流

### 1. 抓取单个页面

以多种格式从URL获取内容，并可选择为动态页面执行浏览器操作。

**工具：** `FIRECRAWL_SCRAPE`

关键参数：
- `url`（必需）-- 要抓取的完整URL
- `formats` -- 输出格式：`markdown`（默认）、`html`、`rawHtml`、`links`、`screenshot`、`json`
- `onlyMainContent`（默认true）-- 仅提取主要内容，排除导航/页脚/广告
- `waitFor` -- 等待JS渲染的毫秒数（默认0）
- `timeout` -- 最大等待时间（毫秒，默认30000）
- `actions` -- 抓取前的浏览器操作（点击、写入、等待、按键、滚动）
- `includeTags` / `excludeTags` -- 按HTML标签过滤
- `jsonOptions` -- 使用 `架构` 和/或 `prompt` 进行结构化提取

示例提示：*"Scrape the main content from https://example.com/pricing as markdown"*

---

### 2. 爬取整个网站

从网站发现并抓取多个页面，可配置深度、路径过滤和并发。

**工具：** `FIRECRAWL_CRAWL_V2`

关键参数：
- `url`（必需）-- 爬取的起始URL
- `limit`（默认10）-- 最大爬取页面数
- `maxDiscoveryDepth` -- 从根页面开始的深度限制
- `includePaths` / `excludePaths` -- URL路径的正则表达式模式
- `allowSubdomains` -- 包含子域名（默认false）
- `crawlEntireDomain` -- 跟随同级/父级链接，不仅限于子级（默认false）
- `sitemap` -- `include`（默认）、`skip` 或 `only`
- `prompt` -- 自然语言自动配置爬虫设置
- `scrapeOptions_formats` -- 每个页面的输出格式
- `scrapeOptions_onlyMainContent` -- 每个页面的主要内容提取

示例提示：*"Crawl the docs section of firecrawl.dev, max 50 pages, only paths matching docs"*

---

### 3. 提取结构化数据

使用AI通过自然语言提示或JSON模式从网页中提取结构化JSON数据。

**工具：** `FIRECRAWL_EXTRACT`

关键参数：
- `urls`（必需）-- 要提取的URL数组（测试版最多10个）。支持通配符，如 `https://example.com/blog/*`
- `prompt` -- 描述要提取内容的自然语言描述
- `架构` -- 定义所需输出结构的JSON 架构
- `enable_web_search` -- 允许爬取初始域名之外的链接（默认false）

必须至少提供 `prompt` 或 `架构` 之一。

使用返回的作业 `id` 通过 `FIRECRAWL_EXTRACT_GET` 检查提取状态。

示例提示：*"Extract company name, pricing tiers, and feature lists from https://example.com/pricing"*

---

### 4. 批量抓取多个URL

使用共享配置并发抓取多个URL，实现高效的批量数据收集。

**工具：** `FIRECRAWL_BATCH_SCRAPE`

关键参数：
- `urls`（必需）-- 要抓取的URL数组
- `formats` -- 所有页面的输出格式（默认 `markdown`）
- `onlyMainContent`（默认true）-- 主要内容提取
- `maxConcurrency` -- 并行抓取限制
- `ignoreInvalidURLs`（默认true）-- 跳过无效URL而不是使批处理失败
- `location` -- 带有 `country` 代码的地理位置设置
- `actions` -- 应用于每个页面的浏览器操作
- `blockAds`（默认true）-- 屏蔽广告

示例提示：*"Batch scrape these 20 product page URLs as markdown with ad blocking"*

---

### 5. 映射网站结构

从起始URL发现网站上的所有URL，用于规划爬取或审计网站结构。

**工具：** `FIRECRAWL_MAP_MULTIPLE_URLS_BASED_ON_OPTIONS`

关键参数：
- `url`（必需）-- 起始URL（必须是 `https://` 或 `http://`）
- `search` -- 引导URL发现指向特定页面类型
- `limit`（默认5000，最大100000）-- 最大返回URL数
- `includeSubdomains`（默认true）-- 包含子域名
- `ignoreQueryParameters`（默认true）-- 去重仅因查询参数不同的URL
- `sitemap` -- `include`、`skip` 或 `only`

示例提示：*"Map all URLs on docs.example.com, focusing on API reference pages"*

---

### 6. 监控和管理爬取作业

跟踪爬取进度、获取结果以及取消失控的作业。

**工具：** `FIRECRAWL_CRAWL_GET`、`FIRECRAWL_GET_THE_STATUS_OF_A_CRAWL_JOB`、`FIRECRAWL_CANCEL_A_CRAWL_JOB`

- `FIRECRAWL_CRAWL_GET` -- 获取状态、进度、已用信用和已爬取页面数据
- `FIRECRAWL_CANCEL_A_CRAWL_JOB` -- 停止活动或排队中的爬取

两者都需要爬取开始时返回的爬取作业 `id`（UUID）。

示例提示：*"Check the status of crawl job 019b0806-b7a1-7652-94c1-e865b5d2e89a"*

---

## 已知陷阱

- **速率限制：** Firecrawl 可能触发"Rate limit exceeded"错误（429）。优先使用 `FIRECRAWL_BATCH_SCRAPE` 替代多次单独的 `FIRECRAWL_SCRAPE` 调用，并在429/5xx响应时实施退避策略。
- **信用消耗：** `FIRECRAWL_EXTRACT` 可能因"Insufficient credits"而失败。严格限定范围，避免使用广泛的首页URL导致稀疏字段。先在小的URL集上测试。
- **嵌套错误响应：** 即使外部API调用成功，每个页面的失败可能嵌套在 `响应.data.code` 中（例如 `SCRAPE_DNS_RESOLUTION_ERROR`）。始终验证内部状态/错误字段。
- **JS繁重页面：** 未渲染的抓取可能错过关键内容。对动态页面使用 `waitFor`（例如1000-5000ms），或配置 `scrapeOptions_actions` 在抓取前与页面交互。
- **提取模式精度：** 模糊或变化模式/提示会产生噪音大、不一致的输出。冻结模式并在扩展到多个URL之前在小样本上测试。
- **爬取作业是异步的：** `FIRECRAWL_CRAWL_V2` 立即返回作业ID。使用 `FIRECRAWL_CRAWL_GET` 轮询结果。使用 `FIRECRAWL_CANCEL_A_CRAWL_JOB` 取消卡住的爬取以避免浪费信用。
- **提取作业轮询：** `FIRECRAWL_EXTRACT` 对于较大作业也是异步的。使用 `FIRECRAWL_EXTRACT_GET` 检索最终输出。
- **URL批处理提取：** 保持提取URL批次较小（约10个URL）以避免429速率限制错误。
- **深层嵌套响应：** 结果通常嵌套在 `data.data` 或更深层级下。检查返回的结构，而不是假设扁平键。

---

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| 工具标识符 | 描述 |
|---|---|
| `FIRECRAWL_SCRAPE` | 使用格式/操作选项抓取单个URL |
| `FIRECRAWL_CRAWL_V2` | 使用深度/路径控制爬取网站 |
| `FIRECRAWL_EXTRACT` | 使用AI提示/模式提取结构化数据 |
| `FIRECRAWL_BATCH_SCRAPE` | 并发批量抓取多个URL |
| `FIRECRAWL_MAP_MULTIPLE_URLS_BASED_ON_OPTIONS` | 发现/映射站点上的所有URL |
| `FIRECRAWL_CRAWL_GET` | 获取爬取作业状态和结果 |
| `FIRECRAWL_GET_THE_STATUS_OF_A_CRAWL_JOB` | 检查爬取作业进度 |
| `FIRECRAWL_CANCEL_A_CRAWL_JOB` | 取消活动的爬取作业 |
| `FIRECRAWL_EXTRACT_GET` | 获取提取作业状态和结果 |
| `FIRECRAWL_CRAWL_PARAMS_PREVIEW` | 在开始前预览爬取参数 |
| `FIRECRAWL_SEARCH` | 网页搜索 + 抓取顶部结果 |

---

*由 [Composio](https://composio.dev) 提供支持*
